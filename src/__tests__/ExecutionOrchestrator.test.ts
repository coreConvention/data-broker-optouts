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
  verified: true,
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

  it("dry-runs an unverified generic broker as manual-needed, not a simulated submission", async () => {
    const ioProvider = createIOProvider();
    const orchestrator = createOrchestrator(ioProvider);
    const { verified: _verified, ...unverifiedBroker } = onlineBroker;

    await orchestrator.executeAll([unverifiedBroker], profile, context);

    const stats = orchestrator.getStatistics().getStatistics();
    expect(stats.manualNeeded).toBe(1);
    expect(stats.success).toBe(0);
    // Nothing would be typed, so the dry run must not echo the person's details
    expect(ioProvider.log).not.toHaveBeenCalledWith("info", expect.stringContaining(profile.email));
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

describe("ExecutionOrchestrator result log writes", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finishes writing a broker's result before reporting its outcome", async () => {
    const events: string[] = [];
    const logger = {
      append: vi.fn(async (result: { site: string }) => {
        // A real write takes at least one turn of the event loop
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`written:${result.site}`);
      }),
      path: () => "test.jsonl",
    } as unknown as Logger;
    const ioProvider: IOProvider = {
      ...createIOProvider(),
      reportProgress: (progress) => {
        if (progress.status !== "processing") events.push(`reported:${progress.broker}`);
      },
    };
    const orchestrator = new ExecutionOrchestrator(logger, { dryRun: true, delayBetweenBrokers: 0 }, ioProvider);

    await orchestrator.executeAll([onlineBroker, emailOnlyBroker, noPathBroker], profile, context);

    expect(events).toEqual([
      "written:OnlineBroker",
      "reported:OnlineBroker",
      "written:EmailOnlyBroker",
      "reported:EmailOnlyBroker",
      "written:NoPathBroker",
      "reported:NoPathBroker",
    ]);
  });

  it("keeps running, and keeps each outcome, when the result log cannot be written", async () => {
    const logger = {
      append: vi.fn().mockRejectedValue(new Error("EACCES: permission denied")),
      path: () => "test.jsonl",
    } as unknown as Logger;
    const ioProvider = createIOProvider();
    const orchestrator = new ExecutionOrchestrator(logger, { dryRun: true, delayBetweenBrokers: 0 }, ioProvider);

    await expect(
      orchestrator.executeAll([onlineBroker, emailOnlyBroker, noPathBroker], profile, context)
    ).resolves.toBeUndefined();

    // A logging problem must not turn a completed broker into a failed one
    const stats = orchestrator.getStatistics().getStatistics();
    expect(stats.success).toBe(1);
    expect(stats.failed).toBe(0);
    expect(ioProvider.log).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Could not write result log for OnlineBroker")
    );
  });
});
