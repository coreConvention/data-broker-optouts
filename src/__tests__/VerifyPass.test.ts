import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { BrowserContext } from "@playwright/test";
import type { BrokerEntry, BrokerRecord, IOProvider, OptOutResult, PersonProfile, RunProgress } from "../types.js";
import type { Logger } from "../utils/logger.js";
import type { Listing, ListingAdapter, RemovalResult, ScanResult, VerifyResult } from "../adapters/ListingAdapter.js";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator.js";
import { StateStore, emptyBrokerRecord } from "../services/StateStore.js";
import { verifyStatus } from "../services/VerifyPass.js";
import { formatDay } from "../utils/formatDay.js";

/**
 * The verify pass for every broker (issue #40): `--verify` on the CLI is
 * `ExecutionOrchestrator.verifyAll`. A fake listing adapter, a clock the test
 * sets, a real state store and a real evidence folder in a temporary
 * directory. No browser and no site.
 */

// Invented person: each value is distinctive enough that a match can only be a leak.
const profile: PersonProfile = {
  fullName: "Zephyrine Quillfeather",
  email: "zq-primary@example.test",
  phone: "555-0142-7791",
  address: "4471 Wobblestone Crescent",
  city: "Marrowgate",
  state: "ZQ",
  zip: "99887",
};

const entry: BrokerEntry = {
  name: "FakeBroker",
  removalUrl: "https://broker.example/optout",
  requirements: ["online"],
  adapter: "generic",
};

const first: Listing = {
  id: "https://broker.example/person/zephyrine-quillfeather-first",
  url: "https://broker.example/person/zephyrine-quillfeather-first",
  summary: "Zephyrine Quillfeather, 41, Marrowgate ZQ",
};
const second: Listing = {
  id: "https://broker.example/person/zephyrine-quillfeather-second",
  url: "https://broker.example/person/zephyrine-quillfeather-second",
  summary: "Zephyrine Quillfeather, 67, Elsewhere ZQ",
};

const T0 = new Date("2026-11-17T18:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const STAMP_T0 = "20261117T180000";
const STAMP_DAY4 = "20261121T180000";

/** What the fake broker answers; tests change it between runs. */
interface Script {
  scan: ScanResult | Error;
  removal: RemovalResult | Error;
  verify: VerifyResult | Error | ((listing: Listing) => VerifyResult);
}

describe("verify pass across brokers (fake adapter, fake clock)", () => {
  let dir: string;
  let stateFile: string;
  let evidenceDir: string;
  let clock: Date;
  let script: Script;
  let written: OptOutResult[];
  let logger: Logger;
  let io: IOProvider & { reported: RunProgress[] };

  const page = {
    close: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn(async (_options?: unknown) => Buffer.from("not really a png")),
  };
  const context = { newPage: vi.fn(async () => page) } as unknown as BrowserContext;

  const adapter = {
    brokerId: "fakebroker",
    removalWindowDays: 3,
    fields: { scan: ["fullName", "state"], request: [] } as ListingAdapter["fields"],
    findListings: vi.fn<ListingAdapter["findListings"]>(async () => {
      if (script.scan instanceof Error) throw script.scan;
      return script.scan;
    }),
    requestRemoval: vi.fn<ListingAdapter["requestRemoval"]>(async () => {
      if (script.removal instanceof Error) throw script.removal;
      return script.removal;
    }),
    verifyRemoval: vi.fn<ListingAdapter["verifyRemoval"]>(async (_page, listing) => {
      if (script.verify instanceof Error) throw script.verify;
      return typeof script.verify === "function" ? script.verify(listing) : script.verify;
    }),
  } satisfies ListingAdapter;

  function scriptedIO(answers: string[] = []): IOProvider & { reported: RunProgress[] } {
    const queue = [...answers];
    const reported: RunProgress[] = [];
    return {
      promptUser: vi.fn(async () => queue.shift() ?? ""),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
      reportProgress: (progress) => reported.push(progress),
      reported,
    };
  }

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-pass-"));
    stateFile = path.join(dir, "state.json");
    evidenceDir = path.join(dir, "evidence");
    clock = T0;
    script = { scan: { kind: "found", listings: [first, second] }, removal: { kind: "requested" }, verify: { kind: "removed" } };
    written = [];
    logger = {
      append: vi.fn(async (result: OptOutResult) => {
        written.push({ ...result });
      }),
      path: () => "test.jsonl",
    } as unknown as Logger;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function orchestrator(answers: string[] = [], dryRun = false): Promise<ExecutionOrchestrator> {
    io = scriptedIO(answers);
    return new ExecutionOrchestrator(logger, { dryRun, delayBetweenBrokers: 0 }, io, {
      stateStore: await StateStore.load(stateFile, profile, { now: () => clock }),
      createListingAdapter: () => adapter,
      evidenceDir,
      now: () => clock,
    });
  }

  /** A normal run: scan, the person picks listings, one request each. */
  async function request(pick: string): Promise<void> {
    await (await orchestrator([pick])).executeAll([entry], profile, context);
    written = [];
    vi.clearAllMocks();
  }

  /** `--verify`. */
  async function verify(options: { dryRun?: boolean } = {}): Promise<ExecutionOrchestrator> {
    const run = await orchestrator([], options.dryRun ?? false);
    await run.verifyAll([entry], profile, context);
    return run;
  }

  const saved = async (): Promise<BrokerRecord> =>
    (await StateStore.load(stateFile, profile)).getBroker("fakebroker");

  /** Every file under the temporary data directory, as relative paths with forward slashes. */
  async function filesOnDisk(): Promise<string[]> {
    const found = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    return found
      .filter((item) => item.isFile())
      .map((item) => path.relative(dir, path.join(item.parentPath, item.name)).split(path.sep).join("/"))
      .sort();
  }

  const logLines = (): string[] => vi.mocked(io.log).mock.calls.map(([, message]) => String(message));

  const everythingShown = (): string =>
    JSON.stringify([written, io.reported, vi.mocked(io.log).mock.calls, vi.mocked(console.log).mock.calls]);

  describe("before the waiting period has passed", () => {
    it("loads nothing, writes nothing and says when the request can be checked", async () => {
      await request("1");
      const before = await saved();
      const filesBefore = await filesOnDisk();

      clock = new Date(T0.getTime() + 2 * DAY);
      await verify();

      expect(context.newPage).not.toHaveBeenCalled();
      expect(adapter.verifyRemoval).not.toHaveBeenCalled();
      expect(adapter.findListings).not.toHaveBeenCalled();
      expect(page.screenshot).not.toHaveBeenCalled();
      expect(written).toEqual([]);
      expect(await saved()).toEqual(before);
      expect(await filesOnDisk()).toEqual(filesBefore);

      const lines = logLines();
      expect(lines).toContain(`FakeBroker: the removal request can be checked from ${formatDay(before.verifyAfter!)}.`);
      expect(lines).toContain("No removal request is ready to check.");
    });

    it("checks it on the first run after the period ends", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 3 * DAY);
      await verify();

      expect(adapter.verifyRemoval).toHaveBeenCalledTimes(1);
    });
  });

  describe("each outcome is written", () => {
    it("removed: the address is gone and a repeat scan does not show it", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "not-found" };
      const run = await verify();

      const record = await saved();
      expect(record.state).toBe("removed");
      expect(record.listings[0]).toMatchObject({ id: first.id, state: "removed", requestAttempts: 1 });
      expect(record.lastVerifiedAt).toBe(clock.toISOString());
      expect(record.nextCheckDue).toBe(new Date(clock.getTime() + 90 * DAY).toISOString());
      expect(record.history.at(-1)).toMatchObject({
        event: "verify",
        result: "removed",
        evidence: `evidence/fakebroker/${STAMP_DAY4}-verify.png`,
      });

      // The listing address was loaded, then the scan repeated. Nothing was requested.
      expect(adapter.verifyRemoval.mock.calls[0]![1]).toMatchObject({ id: first.id, url: first.url });
      expect(adapter.findListings).toHaveBeenCalledTimes(1);
      expect(adapter.requestRemoval).not.toHaveBeenCalled();

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ site: "FakeBroker", status: "removed" });
      expect(written[0]!.message).toBe(`1 listing(s) not found when checked on ${formatDay(clock)}.`);
      expect(run.getStatistics().getStatistics().removed).toBe(1);
      expect(io.reported.at(-1)).toMatchObject({ broker: "FakeBroker", status: "removed", current: 1, total: 1 });
    });

    it("never calls a listing that was not found 'deleted'", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.scan = { kind: "not-found" };

      const run = await verify();
      run.getStatistics().printReport(1);

      const shown = everythingShown();
      expect(shown).not.toMatch(/deleted/i);
      expect(shown).toContain("Not found when checked after a removal request: 1");
    });

    it("listed: the listing is still published, with how many requests it has ignored", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "listed" };
      await verify();

      let record = await saved();
      expect(record.state).toBe("listed");
      expect(record.listings[0]).toMatchObject({ state: "listed", requestAttempts: 1, pending: null });
      expect(record.history.at(-1)).toMatchObject({ event: "verify", result: "listed" });
      expect(written[0]).toMatchObject({ status: "listed" });
      expect(written[0]!.message).toContain("1 listing(s) still published when checked on");
      expect(written[0]!.message).toContain("after 1 removal request(s)");

      // Asked again, ignored again: the count shows it.
      script.scan = { kind: "found", listings: [first] };
      await request("1");
      clock = new Date(clock.getTime() + 4 * DAY);
      await verify();

      record = await saved();
      expect(record.state).toBe("listed");
      expect(record.listings[0]).toMatchObject({ state: "listed", requestAttempts: 2 });
      expect(written[0]!.message).toContain("after 2 removal request(s)");
    });

    it("listed: the address is gone but the repeat scan still shows the listing", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "found", listings: [first] };
      await verify();

      expect((await saved()).state).toBe("listed");
      expect(written[0]).toMatchObject({ status: "listed" });
    });

    it("unknown: the check could not tell", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "unknown", reason: "the site showed a bot check" };
      await verify();

      const record = await saved();
      expect(record.state).toBe("unknown");
      expect(record.history.at(-1)).toMatchObject({ event: "verify", result: "unknown" });
      expect(written[0]).toMatchObject({ status: "unknown" });
      expect(written[0]!.message).toContain("Could not tell for 1 listing(s)");
    });

    it("two listings with different outcomes are each written", async () => {
      await request("1,2");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = (listing) => (listing.id === first.id ? { kind: "removed" } : { kind: "listed" });
      script.scan = { kind: "not-found" };
      await verify();

      const record = await saved();
      expect(record.state).toBe("listed");
      expect(record.listings.map((l) => [l.id, l.state])).toEqual([
        [first.id, "removed"],
        [second.id, "listed"],
      ]);
      expect(written[0]!.message).toContain("1 listing(s) not found when checked on");
      expect(written[0]!.message).toContain("1 listing(s) still published when checked on");
    });
  });

  describe("unknown never becomes removed", () => {
    const cases: [string, () => void][] = [
      ["the check cannot tell", () => { script.verify = { kind: "unknown", reason: "blocked" }; }],
      ["the check throws", () => { script.verify = new Error(`page.goto: Timeout navigating to "${first.url}"`); }],
      ["the address is gone but the repeat scan cannot tell", () => {
        script.verify = { kind: "removed" };
        script.scan = { kind: "unknown", reason: "the site showed a bot check" };
      }],
      ["the address is gone but the repeat scan throws", () => {
        script.verify = { kind: "removed" };
        script.scan = new Error(`page.goto: net::ERR_FAILED at "https://broker.example/name/Zephyrine-Quillfeather"`);
      }],
    ];

    it.each(cases)("when %s", async (_name, arrange) => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      arrange();
      await verify();

      const record = await saved();
      expect(record.state).toBe("unknown");
      // The request stays outstanding, so the next pass looks again.
      expect(record.listings[0]).toMatchObject({ state: "requested", requestAttempts: 1 });
      expect(record.history.map((line) => line.result)).not.toContain("removed");
      expect(written[0]).toMatchObject({ status: "unknown" });
      expect(verifyStatus(record, clock)).toBe("due");

      // An error's text quotes addresses that carry the person's name.
      const shown = everythingShown();
      expect(shown).not.toContain(first.url);
      expect(shown).not.toContain("Quillfeather");
    });

    // A listing can move to a new address. The tool cannot know whether a
    // listing it has never shown the person is theirs, so it cannot say the
    // person is gone from the broker.
    it("when the address is gone but the repeat scan shows a listing the person was never asked about", async () => {
      await request("1");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "found", listings: [second] };
      await verify();

      const record = await saved();
      // The old address is gone, and that much is recorded for the listing...
      expect(record.listings).toEqual([
        { id: first.id, url: first.url, state: "removed", requestAttempts: 1, pending: null },
      ]);
      // ...but the broker is not "removed": it is looked at again on the next run.
      expect(record.state).toBe("unknown");
      expect(written[0]).toMatchObject({ status: "unknown" });
      expect(written[0]!.message).toContain("1 listing(s) not found when checked on");
      expect(written[0]!.message).toContain("still shows 1 other listing(s) you have not been asked about");
      expect(everythingShown()).not.toContain(second.url);
      expect(everythingShown()).not.toContain(second.summary);
    });

    it("then the next run shows that listing to the person, whose 'none' settles it", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "found", listings: [second] };
      await verify();

      clock = new Date(clock.getTime() + DAY);
      await request("none");

      const record = await saved();
      expect(record.state).toBe("removed");
      expect(record.listings.map((l) => [l.id, l.state])).toEqual([[first.id, "removed"]]);
      expect(adapter.requestRemoval).not.toHaveBeenCalled();
    });

    it("and choosing it instead makes the broker relisted", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "found", listings: [second] };
      await verify();

      clock = new Date(clock.getTime() + DAY);
      script.removal = { kind: "not-completed", reason: "left for later" };
      await request("1");

      const record = await saved();
      expect(record.state).toBe("relisted");
      expect(record.timesRelisted).toBe(1);
    });

    it.each([
      ["the listing that cannot be told is checked first", [first.id, second.id]],
      ["the listing that cannot be told is checked last", [second.id, first.id]],
    ])("when one of two listings cannot be told and %s", async (_name, order) => {
      await request("1,2");

      clock = new Date(T0.getTime() + 4 * DAY);
      const cannotTell = order[0]!;
      script.verify = (listing) =>
        listing.id === cannotTell ? { kind: "unknown", reason: "blocked" } : { kind: "removed" };
      script.scan = { kind: "not-found" };
      await verify();

      const record = await saved();
      // Whichever listing was checked first, the broker's state is the same.
      expect(record.state).toBe("unknown");
      expect(record.listings.find((l) => l.id === cannotTell)).toMatchObject({ state: "requested" });
      expect(record.listings.find((l) => l.id !== cannotTell)).toMatchObject({ state: "removed" });
      expect(written[0]).toMatchObject({ status: "unknown" });
    });

    it("a later pass that finds it gone records removed then, not before", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = { kind: "unknown", reason: "blocked" };
      await verify();
      expect((await saved()).state).toBe("unknown");

      clock = new Date(clock.getTime() + DAY);
      script.verify = { kind: "removed" };
      script.scan = { kind: "not-found" };
      await verify();

      const record = await saved();
      expect(record.state).toBe("removed");
      expect(record.lastVerifiedAt).toBe(clock.toISOString());
    });
  });

  describe("a request still waiting on the person", () => {
    it("stays listed with the pending step, is not checked, and is named", async () => {
      script.removal = { kind: "requested", pending: "phone-call" };
      await request("1");
      const before = await saved();
      expect(before.listings[0]).toMatchObject({ state: "listed", pending: "phone-call" });

      clock = new Date(T0.getTime() + 30 * DAY);
      await verify();

      expect(adapter.verifyRemoval).not.toHaveBeenCalled();
      expect(context.newPage).not.toHaveBeenCalled();
      expect(await saved()).toEqual(before);
      expect(written).toEqual([]);
      expect(logLines().some((line) => line.includes("FakeBroker: 1 request(s) still waiting on a step only you can do"))).toBe(true);
    });

    it("is left alone while another listing at the same broker is checked", async () => {
      // "Once" on purpose: a lasting mock would leak into the tests after this one.
      adapter.requestRemoval
        .mockImplementationOnce(async () => ({ kind: "requested" }))
        .mockImplementationOnce(async () => ({ kind: "requested", pending: "email-link" }));
      await request("1,2");

      clock = new Date(T0.getTime() + 4 * DAY);
      script.scan = { kind: "not-found" };
      await verify();

      expect(adapter.verifyRemoval).toHaveBeenCalledTimes(1);
      const record = await saved();
      expect(record.listings.map((l) => [l.id, l.state, l.pending])).toEqual([
        [first.id, "removed", null],
        [second.id, "listed", "email-link"],
      ]);
      expect(record.state).toBe("listed");
    });
  });

  describe("evidence", () => {
    it("puts a screenshot at scan, at the confirmation and at each verify in the evidence folder and nowhere else", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.scan = { kind: "not-found" };
      await verify();

      expect(await filesOnDisk()).toEqual([
        `evidence/fakebroker/${STAMP_T0}-request.png`,
        `evidence/fakebroker/${STAMP_T0}-scan.png`,
        `evidence/fakebroker/${STAMP_DAY4}-verify.png`,
        "state.json",
      ]);

      // The state history points at each file, relative to the data directory.
      const history = (await saved()).history;
      expect(history.map((line) => [line.event, line.evidence])).toEqual([
        ["scan", `evidence/fakebroker/${STAMP_T0}-scan.png`],
        ["request", `evidence/fakebroker/${STAMP_T0}-request.png`],
        ["verify", `evidence/fakebroker/${STAMP_DAY4}-verify.png`],
      ]);

      // The page was never told where to write: the evidence store is the only writer.
      for (const [options] of page.screenshot.mock.calls) {
        expect(options).toEqual({ fullPage: true });
      }
    });

    it("gives two listings checked in the same second a file each", async () => {
      await request("1,2");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.scan = { kind: "not-found" };
      await verify();

      const files = await filesOnDisk();
      expect(files).toContain(`evidence/fakebroker/${STAMP_DAY4}-verify.png`);
      expect(files).toContain(`evidence/fakebroker/${STAMP_DAY4}-verify-2.png`);
      const verifyLines = (await saved()).history.filter((line) => line.event === "verify");
      expect(new Set(verifyLines.map((line) => line.evidence)).size).toBe(2);
    });

    it("names files by broker and time, never by person", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      await verify();

      for (const file of (await filesOnDisk()).filter((name) => name !== "state.json")) {
        expect(file).toMatch(/^evidence\/fakebroker\/\d{8}T\d{6}-(scan|request|verify)(-\d+)?\.png$/);
      }
    });

    it("takes no confirmation screenshot for a request that is still waiting on the person", async () => {
      script.removal = { kind: "requested", pending: "phone-call" };
      await request("1");

      expect(await filesOnDisk()).toEqual([`evidence/fakebroker/${STAMP_T0}-scan.png`, "state.json"]);
    });

    it("keeps the page of a check that threw", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = new Error("the page crashed half way");
      await verify();

      expect(await filesOnDisk()).toContain(`evidence/fakebroker/${STAMP_DAY4}-verify.png`);
      expect((await saved()).history.at(-1)).toMatchObject({
        event: "verify",
        result: "unknown",
        evidence: `evidence/fakebroker/${STAMP_DAY4}-verify.png`,
      });
    });

    it("a screenshot that cannot be saved does not change the outcome", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.scan = { kind: "not-found" };
      page.screenshot.mockRejectedValueOnce(new Error("Target closed"));
      await verify();

      const record = await saved();
      expect(record.state).toBe("removed");
      expect(record.history.at(-1)!.evidence).toBeUndefined();
      expect(logLines()).toContain("A screenshot of the check could not be saved.");
    });

    it("a dry run takes none", async () => {
      await (await orchestrator(["1"], true)).executeAll([entry], profile, context);

      expect(page.screenshot).not.toHaveBeenCalled();
      expect(await filesOnDisk()).toEqual([]);
    });
  });

  describe("what the pass says", () => {
    it("says what the check sends, in field names only, and that nothing is submitted", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      await verify();

      const notice = logLines().find((line) => line.startsWith("Loading the address of 1 listing(s) at FakeBroker"));
      expect(notice).toBeDefined();
      expect(notice).toContain("which sends your name and state");
      expect(notice).toContain("Nothing is submitted");
    });

    it("keeps listing addresses, summaries and profile values out of everything it shows", async () => {
      await request("1,2");
      clock = new Date(T0.getTime() + 4 * DAY);
      script.verify = (listing) => (listing.id === first.id ? { kind: "removed" } : { kind: "listed" });
      script.scan = { kind: "found", listings: [second] };
      const run = await verify();
      run.getStatistics().printReport(1);

      const shown = everythingShown();
      for (const value of [first.url, second.url, first.summary, second.summary, ...Object.values(profile).map(String)]) {
        expect(shown).not.toContain(value);
      }
    });

    it("a dry run names what it would check, loads nothing and writes nothing", async () => {
      await request("1");
      const before = await saved();
      const filesBefore = await filesOnDisk();

      clock = new Date(T0.getTime() + 4 * DAY);
      await verify({ dryRun: true });

      expect(context.newPage).not.toHaveBeenCalled();
      expect(adapter.verifyRemoval).not.toHaveBeenCalled();
      expect(adapter.findListings).not.toHaveBeenCalled();
      expect(await saved()).toEqual(before);
      expect(await filesOnDisk()).toEqual(filesBefore);
      expect(written[0]).toMatchObject({ status: "requested" });
      expect(written[0]!.message).toBe("[DRY RUN] Would check 1 listing(s). Nothing was loaded.");
    });

    it("records a failure outside the adapter as failed, without the error's text", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);
      vi.mocked(context.newPage).mockRejectedValueOnce(
        new Error("browserContext.newPage: profile dir C:\\Users\\zephyrine\\data is locked")
      );
      await verify();

      expect(written[0]).toMatchObject({ status: "failed" });
      expect(written[0]!.message).toBe("the check failed unexpectedly. Nothing was submitted.");
      expect(everythingShown()).not.toContain("zephyrine");
      expect((await saved()).state).toBe("requested");
    });
  });

  describe("which brokers are checked", () => {
    it("ignores a broker without a listing adapter", async () => {
      io = scriptedIO();
      const run = new ExecutionOrchestrator(logger, { dryRun: false, delayBetweenBrokers: 0 }, io, {
        stateStore: await StateStore.load(stateFile, profile, { now: () => clock }),
        evidenceDir,
        now: () => clock,
      });

      await run.verifyAll([entry], profile, context);

      expect(context.newPage).not.toHaveBeenCalled();
      expect(written).toEqual([]);
      expect(logLines()).toEqual(["No removal request is ready to check."]);
    });

    it("refuses to run without a state store", async () => {
      io = scriptedIO();
      const run = new ExecutionOrchestrator(logger, { dryRun: false, delayBetweenBrokers: 0 }, io, {
        createListingAdapter: () => adapter,
      });

      await expect(run.verifyAll([entry], profile, context)).rejects.toThrow(/needs the state file/);
      expect(adapter.verifyRemoval).not.toHaveBeenCalled();
    });

    it("verifyTargets returns only the brokers that are due and loads nothing", async () => {
      await request("1");
      clock = new Date(T0.getTime() + 4 * DAY);

      const due = (await orchestrator()).verifyTargets([entry]);

      expect(due.map((target) => target.entry.name)).toEqual(["FakeBroker"]);
      expect(context.newPage).not.toHaveBeenCalled();
    });
  });
});

describe("verifyStatus", () => {
  const now = new Date("2026-11-21T00:00:00.000Z");
  const withListing = (state: "listed" | "requested" | "removed", verifyAfter: string | null): BrokerRecord => ({
    ...emptyBrokerRecord(),
    verifyAfter,
    listings: [{ id: "x", url: "x", state, requestAttempts: 1, pending: null }],
  });

  it("is none when no request is outstanding", () => {
    expect(verifyStatus(emptyBrokerRecord(), now)).toBe("none");
    expect(verifyStatus(withListing("listed", "2026-11-20T00:00:00.000Z"), now)).toBe("none");
    expect(verifyStatus(withListing("removed", "2026-11-20T00:00:00.000Z"), now)).toBe("none");
  });

  it("is waiting until the window has passed, then due", () => {
    expect(verifyStatus(withListing("requested", "2026-11-21T00:00:00.001Z"), now)).toBe("waiting");
    expect(verifyStatus(withListing("requested", null), now)).toBe("waiting");
    expect(verifyStatus(withListing("requested", "2026-11-21T00:00:00.000Z"), now)).toBe("due");
  });
});
