import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium } from "@playwright/test";
import type { Browser, BrowserContext } from "@playwright/test";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { BrokerEntry, BrokerRecord, IOProvider, OptOutResult, PersonProfile } from "../types.js";
import type { Logger } from "../utils/logger.js";
import { WhitepagesListingAdapter } from "../adapters/sites/WhitepagesListingAdapter.js";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator.js";
import { StateStore } from "../services/StateStore.js";
import { EvidenceStore } from "../services/EvidenceStore.js";
import { verifyBroker } from "../services/VerifyPass.js";
import type { VerifyPassResult } from "../services/VerifyPass.js";

/**
 * Acceptance test for the Whitepages vertical slice (design plan section 10).
 *
 * Headless Chromium drives the real adapter, orchestrator and state store
 * against a small HTTP server on 127.0.0.1 that serves the HTML fixtures in
 * fixtures/whitepages/. Nothing here touches the live site.
 *
 * The fixtures are synthetic: written from the plan's description, not
 * captured from Whitepages, so this test proves the flow and its safety
 * rules, not that the selectors match the live pages (see issue #39).
 * Every person, address and place is invented.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "whitepages");

// The profile's city, address, ZIP, email and phone appear in no fixture, so
// finding one in a recorded request can only be a leak.
const profile: PersonProfile = {
  fullName: "Testy McFixture",
  state: "ZZ",
  city: "Marrowgate",
  zip: "99887",
  address: "4471 Wobblestone Crescent",
  email: "testy.fixture@example.test",
  phone: "555-0142",
};

const FIRST = "/name/Testy-Mcfixture/Nowhere-ZZ/PFIXTURE0001";
const SECOND = "/name/Testy-Mcfixture/Elsewhere-ZZ/PFIXTURE0002";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-17T18:00:00.000Z");

interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  body: string;
}

/** What the fake site serves right now; tests change it between steps. */
interface Scenario {
  search: "none" | "two" | "one" | "challenge" | "unreadable";
  listing: "present" | "gone";
  suppression: "open" | "refused";
}

describe("Whitepages flow against local fixtures", () => {
  let browser: Browser;
  let server: http.Server;
  let baseUrl: string;

  let context: BrowserContext;
  let dir: string;
  let stateFile: string;
  let evidenceDir: string;
  let clock: Date;
  let scenario: Scenario;
  let requests: RecordedRequest[];
  let written: OptOutResult[];
  let prompts: string[];

  const fixture = (name: string): Promise<string> => fs.readFile(path.join(FIXTURES, name), "utf-8");

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        void (async () => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          const method = req.method ?? "GET";
          if (url.pathname !== "/favicon.ico") {
            requests.push({ method, path: url.pathname, query: url.search, body: Buffer.concat(chunks).toString("utf-8") });
          }

          const send = async (status: number, file: string): Promise<void> => {
            res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
            res.end(await fixture(file));
          };
          const segments = url.pathname.split("/").filter(Boolean);

          if (segments[0] === "name" && (segments.length === 2 || segments.length === 3)) {
            if (scenario.search === "challenge") return send(403, "challenge-403.html");
            if (scenario.search === "unreadable") return send(200, "search-unreadable.html");
            if (scenario.search === "two") return send(200, "search-two-results.html");
            if (scenario.search === "one") return send(200, "search-one-result.html");
            return send(200, "search-no-results.html");
          }
          if (segments[0] === "name" && segments.length === 4) {
            return scenario.listing === "present" ? send(200, "listing.html") : send(404, "listing-gone.html");
          }
          if (url.pathname === "/suppression-requests") {
            if (scenario.suppression === "refused") return send(403, "challenge-403.html");
            return send(200, method === "POST" ? "suppression-step2.html" : "suppression-step1.html");
          }
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not a fixture");
        })();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    context = await browser.newContext();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "whitepages-flow-"));
    stateFile = path.join(dir, "state.json");
    evidenceDir = path.join(dir, "evidence");
    clock = T0;
    scenario = { search: "none", listing: "present", suppression: "open" };
    requests = [];
    written = [];
    prompts = [];
  });

  afterEach(async () => {
    // Case 8, checked after every test: only the name search and the listing
    // address ever reach the server.
    expectNothingElseSent();
    vi.restoreAllMocks();
    await context.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  function expectNothingElseSent(): void {
    const everything = JSON.stringify(requests);
    for (const secret of [profile.email, profile.phone!, profile.address!, profile.zip!, profile.city!]) {
      expect(everything).not.toContain(secret);
      expect(everything).not.toContain(encodeURIComponent(secret));
    }
    for (const request of requests) {
      if (request.method === "POST") {
        // The suppression form carries the listing address and nothing else.
        expect(request.path).toBe("/suppression-requests");
        const fields = [...new URLSearchParams(request.body).entries()];
        expect(fields).toHaveLength(1);
        expect(fields[0]![0]).toBe("profile_url");
        expect(fields[0]![1]).toMatch(new RegExp(`^${baseUrl}/name/[^/]+/[^/]+/[^/?]+$`));
      } else {
        // Reads: the name search (name and state only), a listing, the suppression page.
        expect(request.path).toMatch(/^\/(name\/Testy-McFixture\/ZZ|name\/Testy-Mcfixture\/[^/]+\/[^/]+|suppression-requests)$/);
        expect(request.query).toBe("");
      }
    }
  }

  const entry = (): BrokerEntry => ({
    name: "Whitepages",
    removalUrl: `${baseUrl}/suppression-requests`,
    requirements: ["online", "captcha", "phone-verification"],
    adapter: "Whitepages",
  });

  /** An IOProvider whose prompts are answered from a script, in order. */
  function scriptedIO(answers: string[]): IOProvider {
    const queue = [...answers];
    return {
      promptUser: vi.fn(async (message: string) => {
        prompts.push(message);
        return queue.shift() ?? "";
      }),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
    };
  }

  const newAdapter = (): WhitepagesListingAdapter =>
    new WhitepagesListingAdapter({ baseUrl, navigationTimeoutMs: 10000 });

  const loadStore = (): Promise<StateStore> => StateStore.load(stateFile, profile, { now: () => clock });

  async function newOrchestrator(answers: string[]): Promise<ExecutionOrchestrator> {
    const logger = {
      append: vi.fn(async (result: OptOutResult) => {
        written.push({ ...result });
      }),
      path: () => "test.jsonl",
    } as unknown as Logger;
    return new ExecutionOrchestrator(
      logger,
      { dryRun: false, delayBetweenBrokers: 0 },
      scriptedIO(answers),
      { stateStore: await loadStore(), createListingAdapter: () => newAdapter(), evidenceDir, now: () => clock }
    );
  }

  /** One run of the tool: scan, confirm, request. */
  async function run(answers: string[]): Promise<void> {
    await (await newOrchestrator(answers)).executeAll([entry()], profile, context);
  }

  /** One verify pass. */
  async function verify(answers: string[] = []): Promise<VerifyPassResult> {
    const page = await context.newPage();
    try {
      return await verifyBroker({
        adapter: newAdapter(),
        store: await loadStore(),
        page,
        profile,
        ioProvider: scriptedIO(answers),
        now: clock,
        evidence: new EvidenceStore(evidenceDir, () => clock),
      });
    } finally {
      await page.close();
    }
  }

  /** The broker's record as the next run would read it from disk. */
  const saved = async (): Promise<BrokerRecord> => (await loadStore()).getBroker("whitepages");

  const suppressionRequests = (): RecordedRequest[] => requests.filter((r) => r.path === "/suppression-requests");

  async function evidenceFiles(): Promise<string[]> {
    return fs.readdir(path.join(evidenceDir, "whitepages")).catch(() => []);
  }

  /** Case 2: two candidates, the person picks the second and finishes the request. */
  async function requestSecondListing(): Promise<void> {
    scenario.search = "two";
    await run(["2", "done"]);
  }

  it("case 1: no results gives not-found and never opens the suppression page", async () => {
    scenario.search = "none";

    await run([]);

    expect((await saved()).state).toBe("not-found");
    expect(written[0]).toMatchObject({ site: "Whitepages", status: "not-found" });
    expect(suppressionRequests()).toHaveLength(0);
    expect(prompts).toHaveLength(0);
    expect(requests.map((r) => r.path)).toEqual(["/name/Testy-McFixture/ZZ"]);
  });

  it("case 2: two candidates, the second picked, makes exactly one request for that listing", async () => {
    await requestSecondListing();

    // The person was shown both candidates, with the broker's own text.
    expect(prompts[0]).toContain("1. Testy Mcfixture Age 41 Nowhere, ZZ");
    expect(prompts[0]).toContain("2. Testy Mcfixture Age 67 Elsewhere, ZZ");

    // Exactly one suppression request; the only value typed is the second listing's address.
    const posts = suppressionRequests().filter((r) => r.method === "POST");
    expect(posts).toHaveLength(1);
    expect([...new URLSearchParams(posts[0]!.body).entries()]).toEqual([["profile_url", baseUrl + SECOND]]);
    expect(suppressionRequests().filter((r) => r.method === "GET")).toHaveLength(1);

    const record = await saved();
    expect(record.state).toBe("requested");
    expect(record.listings).toEqual([
      { id: baseUrl + SECOND, url: baseUrl + SECOND, state: "requested", requestAttempts: 1, pending: null },
    ]);
    expect(record.lastRequestedAt).toBe(T0.toISOString());
    expect(record.verifyAfter).toBe(new Date(T0.getTime() + 3 * DAY).toISOString());

    // Two evidence files, the listing as found and the confirmation, named by
    // broker and time, never by person. Both are real images.
    const files = await evidenceFiles();
    expect(files).toEqual(["20261117T180000-request.png", "20261117T180000-scan.png"]);
    for (const file of files) {
      const image = await fs.readFile(path.join(evidenceDir, "whitepages", file));
      expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
    expect(record.history.map((line) => [line.event, line.result, line.evidence])).toEqual([
      ["scan", "listed", "evidence/whitepages/20261117T180000-scan.png"],
      ["request", "requested", "evidence/whitepages/20261117T180000-request.png"],
    ]);
    expect(written[0]).toMatchObject({ status: "requested" });
  });

  it("case 3: two candidates, none picked, gives not-found and never opens the suppression page", async () => {
    scenario.search = "two";

    await run(["none"]);

    const record = await saved();
    expect(record.state).toBe("not-found");
    expect(record.history.at(-1)).toMatchObject({ result: "not-found", source: "person" });
    expect(suppressionRequests()).toHaveLength(0);
    expect(await evidenceFiles()).toEqual([]);
  });

  it("case 4: verify before the window loads nothing and changes nothing", async () => {
    await requestSecondListing();
    const before = await saved();
    const requestsBefore = requests.length;

    clock = new Date(T0.getTime() + 1 * DAY);
    const result = await verify();

    expect(result).toEqual({ kind: "not-due" });
    expect(requests).toHaveLength(requestsBefore);
    expect(await saved()).toEqual(before);
  });

  it("case 5: after the window, a gone listing and an empty search give removed", async () => {
    await requestSecondListing();

    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "gone";
    scenario.search = "none";
    const result = await verify();

    expect(result).toEqual({ kind: "verified", state: "removed", removed: 1, listed: 0, unknown: 0, attempts: 0 });
    const record = await saved();
    expect(record.state).toBe("removed");
    expect(record.lastVerifiedAt).toBe(clock.toISOString());
    expect(record.nextCheckDue).toBe(new Date(clock.getTime() + 90 * DAY).toISOString());
    // The check's own screenshot sits beside the earlier two.
    expect(await evidenceFiles()).toContain("20261121T180000-verify.png");
    expect(record.history.at(-1)).toMatchObject({
      event: "verify",
      result: "removed",
      evidence: "evidence/whitepages/20261121T180000-verify.png",
    });
    // Verify loaded the listing address, then repeated the scan, and submitted nothing.
    expect(requests.slice(-2).map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${SECOND}`, "GET /name/Testy-McFixture/ZZ"]);
    expect(suppressionRequests().filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("case 6: a listing found 91 days after removed gives relisted, counted once", async () => {
    await requestSecondListing();
    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "gone";
    scenario.search = "none";
    await verify();

    clock = new Date(clock.getTime() + 91 * DAY);
    scenario.listing = "present";
    scenario.search = "one";
    // The person confirms the listing is theirs, then leaves the new request for later.
    await run(["1", "skip"]);

    const record = await saved();
    expect(record.state).toBe("relisted");
    expect(record.timesRelisted).toBe(1);
    expect(record.listings[0]).toMatchObject({ id: baseUrl + SECOND, state: "listed", requestAttempts: 1 });
    expect(written.at(-1)).toMatchObject({ status: "relisted" });
  });

  describe("case 7: a 403 challenge page", () => {
    beforeEach(() => {
      scenario.search = "challenge";
    });

    it("gives unknown, never not-found, and shows the guided prompt", async () => {
      await run([""]);

      expect((await saved()).state).toBe("unknown");
      expect(written[0]!.status).toBe("unknown");
      expect(written[0]!.message).toContain("HTTP 403");
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("could not be read automatically");
      expect(prompts[0]).toContain("Paste the address of each profile that is yours");
      expect(suppressionRequests()).toHaveLength(0);
      // One load, no retry with tricks.
      expect(requests).toHaveLength(1);
    });

    it("records the person's own 'none' as not-found from the person", async () => {
      await run(["none"]);

      const record = await saved();
      expect(record.state).toBe("not-found");
      expect(record.history.at(-1)).toMatchObject({ source: "person" });
      expect(suppressionRequests()).toHaveLength(0);
    });

    it("takes a pasted profile address through confirm and request", async () => {
      await run([`${baseUrl}${SECOND}?utm=shared`, "1", "done"]);

      const record = await saved();
      expect(record.state).toBe("requested");
      expect(record.listings[0]!.id).toBe(baseUrl + SECOND);
    });

    it("stays unknown when the pasted text is not a profile on this site", async () => {
      await run(["https://elsewhere.example/name/Testy-Mcfixture/Nowhere-ZZ/P1"]);

      expect((await saved()).state).toBe("unknown");
      expect(suppressionRequests()).toHaveLength(0);
    });
  });

  it("a page that is neither results nor 'no results' is unknown", async () => {
    scenario.search = "unreadable";

    await run([""]);

    expect((await saved()).state).toBe("unknown");
    expect(prompts[0]).toContain("did not look like a results page");
  });

  it("a verification call that never came leaves the listing listed with the call pending", async () => {
    scenario.search = "two";

    await run(["2", "call"]);

    const record = await saved();
    expect(record.state).toBe("listed");
    expect(record.listings[0]).toMatchObject({ state: "listed", pending: "phone-call", requestAttempts: 1 });
    expect(record.verifyAfter).toBeNull();
    // The listing as found, and no confirmation: there was none to capture.
    expect(await evidenceFiles()).toEqual(["20261117T180000-scan.png"]);
  });

  it("a refused suppression page types nothing and leaves the listing listed", async () => {
    scenario.search = "two";
    scenario.suppression = "refused";

    await run(["2", "done"]);

    expect((await saved()).state).toBe("listed");
    expect(suppressionRequests().filter((r) => r.method === "POST")).toHaveLength(0);
    // Only the listing picker was shown; the person was never asked to finish a request.
    expect(prompts).toHaveLength(1);
  });

  it("after the window, a listing that is still published stays listed", async () => {
    await requestSecondListing();

    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "present";
    const result = await verify();

    expect(result).toEqual({ kind: "verified", state: "listed", removed: 0, listed: 1, unknown: 0, attempts: 1 });
    expect((await saved()).listings[0]).toMatchObject({ state: "listed", requestAttempts: 1 });
  });

  it("the verify command checks Whitepages through the orchestrator and submits nothing", async () => {
    await requestSecondListing();
    written = [];

    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "gone";
    scenario.search = "none";
    await (await newOrchestrator([])).verifyAll([entry()], profile, context);

    expect((await saved()).state).toBe("removed");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ site: "Whitepages", status: "removed" });
    expect(written[0]!.message).toMatch(/^1 listing\(s\) not found when checked on \d{4}-\d{2}-\d{2}\.$/);
    expect(requests.slice(-2).map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${SECOND}`, "GET /name/Testy-McFixture/ZZ"]);
    expect(suppressionRequests().filter((r) => r.method === "POST")).toHaveLength(1);
    expect(await evidenceFiles()).toContain("20261121T180000-verify.png");
  });

  it("after the window, a gone address that is still in the search results stays listed", async () => {
    await requestSecondListing();

    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "gone";
    scenario.search = "one";
    const result = await verify();

    expect(result).toMatchObject({ kind: "verified", state: "listed" });
  });

  it("after the window, a blocked rescan gives unknown, not removed", async () => {
    await requestSecondListing();

    clock = new Date(T0.getTime() + 4 * DAY);
    scenario.listing = "gone";
    scenario.search = "challenge";
    const result = await verify([""]);

    expect(result).toMatchObject({ kind: "verified", state: "unknown", removed: 0, unknown: 1 });
  });

  it("case 8: the state file and evidence folder are matched by .gitignore", () => {
    const ignored = (target: string): boolean => {
      try {
        execFileSync("git", ["check-ignore", "-q", target], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored("data/state.json")).toBe(true);
    expect(ignored("data/evidence/whitepages/20261117T180000-request.png")).toBe(true);
  });
});

describe("Whitepages fixtures", () => {
  it("are marked synthetic and name only the invented person", async () => {
    const files = (await fs.readdir(FIXTURES)).filter((file) => file.endsWith(".html"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const html = await fs.readFile(path.join(FIXTURES, file), "utf-8");
      expect(html).toContain("SYNTHETIC FIXTURE");
      // No phone numbers or email addresses of any kind.
      expect(html).not.toMatch(/\d{3}[-.\s]\d{3}[-.\s]\d{4}/);
      expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    }
  });
});
