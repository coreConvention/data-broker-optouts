import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BrowserContext } from "@playwright/test";
import type { BrokerEntry, IOProvider, PersonProfile, RunProgress } from "../types.js";
import type { Logger } from "../utils/logger.js";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator.js";

const profile: PersonProfile = { fullName: "Test Person", email: "test@example.com" };

// Dry runs never touch the browser context, so an empty stand-in is enough.
const context = {} as BrowserContext;

const onlineBroker: BrokerEntry = {
  name: "OnlineBroker",
  removalUrl: "https://example.com/optout",
  requirements: ["online"],
  adapter: "generic",
};
const emailOnlyBroker: BrokerEntry = {
  name: "EmailOnlyBroker",
  removalUrl: "https://example.com/contact",
  requirements: ["email"],
  adapter: "generic",
};
const noPathBroker: BrokerEntry = {
  name: "NoPathBroker",
  requirements: ["unknown"],
  adapter: "generic",
};

function createLogger(): Logger {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    path: () => "test.jsonl",
  } as unknown as Logger;
}

function createIOProvider(): IOProvider {
  return {
    promptUser: vi.fn().mockResolvedValue(""),
    waitForConfirmation: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    shouldOpenInBrowser: vi.fn().mockReturnValue(false),
  };
}

function createOrchestrator(ioProvider: IOProvider): ExecutionOrchestrator {
  return new ExecutionOrchestrator(createLogger(), { dryRun: true, delayBetweenBrokers: 0 }, ioProvider);
}

describe("ExecutionOrchestrator progress reporting", () => {
  beforeEach(() => {
    // The end-of-run statistics report prints straight to the console
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports each broker as processing, then with its outcome", async () => {
    const reported: RunProgress[] = [];
    const ioProvider: IOProvider = {
      ...createIOProvider(),
      reportProgress: (progress) => reported.push(progress),
    };

    await createOrchestrator(ioProvider).executeAll(
      [onlineBroker, emailOnlyBroker, noPathBroker],
      profile,
      context
    );

    expect(reported).toEqual([
      { current: 0, total: 3, broker: "OnlineBroker", status: "processing" },
      {
        current: 1,
        total: 3,
        broker: "OnlineBroker",
        status: "success",
        message: "[DRY RUN] Simulated successful submission",
      },
      { current: 1, total: 3, broker: "EmailOnlyBroker", status: "processing" },
      {
        current: 2,
        total: 3,
        broker: "EmailOnlyBroker",
        status: "manual-needed",
        message: "Email-only removal. See notes/website.",
      },
      { current: 2, total: 3, broker: "NoPathBroker", status: "processing" },
      {
        current: 3,
        total: 3,
        broker: "NoPathBroker",
        status: "skipped",
        message: "No online/email/phone path defined.",
      },
    ]);
  });

  it("runs normally with a provider that has no reportProgress (the CLI)", async () => {
    const ioProvider = createIOProvider();
    const orchestrator = createOrchestrator(ioProvider);

    await expect(orchestrator.executeAll([onlineBroker], profile, context)).resolves.toBeUndefined();
    expect(orchestrator.getStatistics().getStatistics().success).toBe(1);
  });

  it("reports nothing for brokers that are never started after a stop", async () => {
    const reportProgress = vi.fn();
    const ioProvider: IOProvider = { ...createIOProvider(), reportProgress };
    const orchestrator = createOrchestrator(ioProvider);

    reportProgress.mockImplementation((progress: RunProgress) => {
      if (progress.status !== "processing") orchestrator.requestStop();
    });

    await orchestrator.executeAll([onlineBroker, emailOnlyBroker], profile, context);

    const brokers: string[] = reportProgress.mock.calls.map(([progress]) => (progress as RunProgress).broker);
    expect(brokers).toEqual(["OnlineBroker", "OnlineBroker"]);
  });
});
