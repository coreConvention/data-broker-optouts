import { describe, it, expect, vi } from "vitest";
import type { IOProvider, BrokerEntry, ExecutionContext } from "../types.js";
import { BrokerEntrySchema } from "../config/schemas.js";

/**
 * Creates a mock IOProvider where every method is a vitest spy.
 */
function createMockIOProvider(): IOProvider {
  return {
    promptUser: vi.fn().mockResolvedValue("user input"),
    waitForConfirmation: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    shouldOpenInBrowser: vi.fn().mockReturnValue(false),
  };
}

describe("IOProvider interface", () => {
  it("can be implemented with all required methods", () => {
    const provider = createMockIOProvider();

    expect(provider.promptUser).toBeDefined();
    expect(provider.waitForConfirmation).toBeDefined();
    expect(provider.log).toBeDefined();
    expect(provider.openExternal).toBeDefined();
    expect(provider.shouldOpenInBrowser).toBeDefined();
  });

  it("promptUser returns a string", async () => {
    const provider = createMockIOProvider();

    const result = await provider.promptUser("Enter your name");
    expect(typeof result).toBe("string");
    expect(result).toBe("user input");
  });

  it("promptUser accepts broker option", async () => {
    const provider = createMockIOProvider();

    await provider.promptUser("Solve CAPTCHA", { broker: "Spokeo" });
    expect(provider.promptUser).toHaveBeenCalledWith("Solve CAPTCHA", { broker: "Spokeo" });
  });

  it("waitForConfirmation resolves without a value", async () => {
    const provider = createMockIOProvider();

    const result = await provider.waitForConfirmation("Click continue", {
      broker: "Radaris",
      url: "https://radaris.com/optout",
    });
    expect(result).toBeUndefined();
  });

  it("log accepts all valid levels", () => {
    const provider = createMockIOProvider();

    provider.log("info", "informational message");
    provider.log("warn", "warning message");
    provider.log("error", "error message");
    provider.log("success", "success message");

    expect(provider.log).toHaveBeenCalledTimes(4);
  });

  it("openExternal resolves without a value", async () => {
    const provider = createMockIOProvider();

    const result = await provider.openExternal("https://example.com");
    expect(result).toBeUndefined();
    expect(provider.openExternal).toHaveBeenCalledWith("https://example.com");
  });
});

describe("shouldOpenInBrowser and humanInteraction", () => {
  it("reads humanInteraction field set to 'browser'", () => {
    const provider = createMockIOProvider();
    // Implement a realistic shouldOpenInBrowser that checks the field
    (provider.shouldOpenInBrowser as ReturnType<typeof vi.fn>).mockImplementation(
      (broker: BrokerEntry) => broker.humanInteraction === "browser"
    );

    const broker: BrokerEntry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "browser",
    };

    expect(provider.shouldOpenInBrowser(broker)).toBe(true);
  });

  it("reads humanInteraction field set to 'modal'", () => {
    const provider = createMockIOProvider();
    (provider.shouldOpenInBrowser as ReturnType<typeof vi.fn>).mockImplementation(
      (broker: BrokerEntry) => broker.humanInteraction === "browser"
    );

    const broker: BrokerEntry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "modal",
    };

    expect(provider.shouldOpenInBrowser(broker)).toBe(false);
  });

  it("defaults to falsy when humanInteraction is not set", () => {
    const provider = createMockIOProvider();
    (provider.shouldOpenInBrowser as ReturnType<typeof vi.fn>).mockImplementation(
      (broker: BrokerEntry) => broker.humanInteraction === "browser"
    );

    const broker: BrokerEntry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      // humanInteraction intentionally omitted
    };

    expect(provider.shouldOpenInBrowser(broker)).toBe(false);
    expect(broker.humanInteraction).toBeUndefined();
  });
});

describe("ExecutionContext", () => {
  it("holds an IOProvider reference", () => {
    const provider = createMockIOProvider();
    const context: ExecutionContext = { ioProvider: provider };

    expect(context.ioProvider).toBe(provider);
    expect(context.ioProvider.promptUser).toBeDefined();
  });
});

describe("BrokerEntrySchema with humanInteraction", () => {
  it("accepts a broker entry with humanInteraction 'modal'", () => {
    const entry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "modal",
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });

  it("accepts a broker entry with humanInteraction 'browser'", () => {
    const entry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "browser",
    };
    expect(() => BrokerEntrySchema.parse(entry)).not.toThrow();
  });

  it("accepts a broker entry without humanInteraction", () => {
    const entry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
    };
    const parsed = BrokerEntrySchema.parse(entry);
    expect(parsed.humanInteraction).toBeUndefined();
  });

  it("rejects an invalid humanInteraction value", () => {
    const entry = {
      name: "TestBroker",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "invalid",
    };
    expect(() => BrokerEntrySchema.parse(entry)).toThrow();
  });
});
