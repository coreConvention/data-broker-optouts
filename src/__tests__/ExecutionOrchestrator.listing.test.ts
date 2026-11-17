import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { BrowserContext } from "@playwright/test";
import type { BrokerEntry, IOProvider, OptOutResult, PersonProfile, RunProgress } from "../types.js";
import type { Logger } from "../utils/logger.js";
import type { Listing, ListingAdapter, RemovalResult, ScanResult } from "../adapters/ListingAdapter.js";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator.js";
import { StateStore } from "../services/StateStore.js";

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
  id: "https://broker.example/person/first",
  url: "https://broker.example/person/first",
  summary: "Zephyrine Quillfeather, 41, Marrowgate ZQ",
};
const second: Listing = {
  id: "https://broker.example/person/second",
  url: "https://broker.example/person/second",
  summary: "Zephyrine Quillfeather, 67, Elsewhere ZQ",
};

const T0 = new Date("2026-11-17T18:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** A listing adapter that returns scripted results and records what it was given. */
function fakeAdapter(scan: ScanResult | Error, removal: RemovalResult | Error = { kind: "requested" }) {
  const adapter = {
    brokerId: "fakebroker",
    removalWindowDays: 3,
    fields: { scan: ["fullName", "state"], request: [] } as ListingAdapter["fields"],
    findListings: vi.fn<ListingAdapter["findListings"]>(async () => {
      if (scan instanceof Error) throw scan;
      return scan;
    }),
    requestRemoval: vi.fn<ListingAdapter["requestRemoval"]>(async () => {
      if (removal instanceof Error) throw removal;
      return removal;
    }),
    verifyRemoval: vi.fn<ListingAdapter["verifyRemoval"]>(async () => ({ kind: "removed" })),
  };
  return adapter satisfies ListingAdapter;
}

/** An IOProvider whose prompts are answered from a script, in order. */
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

describe("ExecutionOrchestrator scan-confirm-request flow", () => {
  let dir: string;
  let stateFile: string;
  let store: StateStore;
  let written: OptOutResult[];
  let logger: Logger;
  const page = { close: vi.fn().mockResolvedValue(undefined) };
  const context = { newPage: vi.fn(async () => page) } as unknown as BrowserContext;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "listing-flow-"));
    stateFile = path.join(dir, "state.json");
    store = await StateStore.load(stateFile, profile, { now: () => T0 });
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

  async function run(
    adapter: ListingAdapter,
    io: IOProvider,
    options: { dryRun?: boolean; stateStore?: StateStore | null } = {}
  ): Promise<ExecutionOrchestrator> {
    const orchestrator = new ExecutionOrchestrator(
      logger,
      { dryRun: options.dryRun ?? false, delayBetweenBrokers: 0 },
      io,
      {
        ...(options.stateStore === null ? {} : { stateStore: options.stateStore ?? store }),
        createListingAdapter: () => adapter,
      }
    );
    await orchestrator.executeAll([entry], profile, context);
    return orchestrator;
  }

  /** What is on disk, read the way the next run would read it. */
  async function saved() {
    return (await StateStore.load(stateFile, profile)).getBroker("fakebroker");
  }

  it("not-found sends nothing", async () => {
    const adapter = fakeAdapter({ kind: "not-found" });
    const io = scriptedIO();

    const orchestrator = await run(adapter, io);

    expect(adapter.requestRemoval).not.toHaveBeenCalled();
    expect(io.promptUser).not.toHaveBeenCalled();
    expect((await saved()).state).toBe("not-found");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ site: "FakeBroker", status: "not-found" });
    expect(orchestrator.getStatistics().getStatistics().notFound).toBe(1);
  });

  it("two candidates with one chosen makes exactly one request", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first, second] });
    const io = scriptedIO(["2"]);

    await run(adapter, io);

    expect(adapter.requestRemoval).toHaveBeenCalledTimes(1);
    expect(adapter.requestRemoval.mock.calls[0]![1]).toEqual(second);

    const record = await saved();
    expect(record.state).toBe("requested");
    expect(record.listings).toEqual([
      { id: second.id, url: second.url, state: "requested", requestAttempts: 1, pending: null },
    ]);
    expect(record.verifyAfter).toBe(new Date(T0.getTime() + 3 * DAY).toISOString());
    expect(written[0]).toMatchObject({ status: "requested" });
    expect(io.reported.at(-1)).toMatchObject({ broker: "FakeBroker", status: "requested", current: 1, total: 1 });
  });

  it("none chosen makes no request and records not-found from the person", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first, second] });
    const io = scriptedIO(["none"]);

    await run(adapter, io);

    expect(adapter.requestRemoval).not.toHaveBeenCalled();
    const record = await saved();
    expect(record.state).toBe("not-found");
    expect(record.history.at(-1)).toMatchObject({ event: "scan", result: "not-found", source: "person" });
    expect(written[0]).toMatchObject({ status: "not-found" });
  });

  it("unknown stops the broker and is never recorded as not-found", async () => {
    const adapter = fakeAdapter({ kind: "unknown", reason: "the page asked for a CAPTCHA" });
    const io = scriptedIO(["1"]);

    const orchestrator = await run(adapter, io);

    expect(adapter.requestRemoval).not.toHaveBeenCalled();
    expect(io.promptUser).not.toHaveBeenCalled();
    expect((await saved()).state).toBe("unknown");
    expect(written[0]!.status).toBe("unknown");
    expect(written[0]!.message).toContain("CAPTCHA");
    expect(orchestrator.getStatistics().getStatistics()).toMatchObject({ unknown: 1, notFound: 0 });
  });

  it("a scan that throws is unknown, not failed and not not-found", async () => {
    const adapter = fakeAdapter(new Error("net::ERR_CONNECTION_RESET"));

    await run(adapter, scriptedIO());

    expect((await saved()).state).toBe("unknown");
    expect(written[0]!.status).toBe("unknown");
  });

  it("a failed request leaves the listing listed", async () => {
    const adapter = fakeAdapter(
      { kind: "found", listings: [first] },
      { kind: "not-completed", reason: "the Next button was not found" }
    );

    await run(adapter, scriptedIO(["1"]));

    const record = await saved();
    expect(record.state).toBe("listed");
    expect(record.listings[0]).toMatchObject({ state: "listed", requestAttempts: 0 });
    expect(record.verifyAfter).toBeNull();
    expect(written[0]).toMatchObject({ status: "listed" });
  });

  it("a request that throws leaves the listing listed and the run going", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first] }, new Error("page closed"));

    const orchestrator = await run(adapter, scriptedIO(["1"]));

    expect((await saved()).state).toBe("listed");
    expect(orchestrator.getStatistics().getStatistics()).toMatchObject({ listed: 1, failed: 0 });
  });

  it("a request waiting on the person stays listed with the pending step recorded", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first] }, { kind: "requested", pending: "phone-call" });

    await run(adapter, scriptedIO(["1"]));

    const record = await saved();
    expect(record.state).toBe("listed");
    expect(record.listings[0]).toMatchObject({ pending: "phone-call", requestAttempts: 1 });
  });

  it("does not repeat a request that is already outstanding", async () => {
    await run(fakeAdapter({ kind: "found", listings: [first] }), scriptedIO(["1"]));

    const again = fakeAdapter({ kind: "found", listings: [first] });
    store = await StateStore.load(stateFile, profile, { now: () => new Date(T0.getTime() + DAY) });
    await run(again, scriptedIO(["1"]));

    expect(again.requestRemoval).not.toHaveBeenCalled();
    const record = await saved();
    expect(record.state).toBe("requested");
    expect(record.listings[0]!.requestAttempts).toBe(1);
  });

  it("passes each step only the profile fields the adapter declared", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first] });

    await run(adapter, scriptedIO(["1"]));

    expect(adapter.findListings.mock.calls[0]![1]).toEqual({ fullName: profile.fullName, state: profile.state });
    expect(adapter.requestRemoval.mock.calls[0]![2]).toEqual({});
  });

  it("dry run scans and asks, reports what it would request, and writes no state", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first, second] });
    const io = scriptedIO(["1,2"]);

    await run(adapter, io, { dryRun: true });

    expect(adapter.findListings).toHaveBeenCalledTimes(1);
    expect(adapter.requestRemoval).not.toHaveBeenCalled();
    expect(written[0]!.status).toBe("listed");
    expect(written[0]!.message).toBe("[DRY RUN] Would request removal of 2 listing(s). Nothing was sent.");
    await expect(fs.access(stateFile)).rejects.toThrow();
  });

  it("keeps listing addresses, summaries and profile values out of the run log and progress", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first, second] });
    const io = scriptedIO(["2"]);

    await run(adapter, io);

    // The prompt is the one place the person sees the candidates.
    const output = JSON.stringify([written, io.reported, vi.mocked(io.log).mock.calls, vi.mocked(console.log).mock.calls]);
    for (const value of [first.url, second.url, first.summary, ...Object.values(profile).map(String)]) {
      expect(output).not.toContain(value);
    }
    expect(vi.mocked(io.promptUser).mock.calls[0]![0]).toContain(second.summary);
  });

  it("closes the page it opened", async () => {
    await run(fakeAdapter({ kind: "not-found" }), scriptedIO());
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("fails the broker, sending nothing, when no state store was given", async () => {
    const adapter = fakeAdapter({ kind: "found", listings: [first] });

    await run(adapter, scriptedIO(["1"]), { stateStore: null });

    expect(adapter.findListings).not.toHaveBeenCalled();
    expect(adapter.requestRemoval).not.toHaveBeenCalled();
    expect(written[0]).toMatchObject({ status: "failed" });
  });

  it("leaves a broker without a listing adapter on its current path", async () => {
    const orchestrator = new ExecutionOrchestrator(
      logger,
      { dryRun: true, delayBetweenBrokers: 0 },
      scriptedIO(),
      { stateStore: store }
    );

    await orchestrator.executeAll([{ ...entry, verified: true }], profile, context);

    expect(context.newPage).not.toHaveBeenCalled();
    expect(written[0]).toMatchObject({ status: "success" });
  });
});
