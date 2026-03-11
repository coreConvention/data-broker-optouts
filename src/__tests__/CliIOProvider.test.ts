import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrokerEntry } from "../types.js";

// Mock the readline-based helpers before importing CliIOProvider
vi.mock("../utils/human.js", () => ({
  waitForEnter: vi.fn().mockResolvedValue(undefined),
  promptForCode: vi.fn().mockResolvedValue("abc123"),
}));

import { CliIOProvider } from "../providers/CliIOProvider.js";
import { waitForEnter, promptForCode } from "../utils/human.js";

describe("CliIOProvider", () => {
  let provider: CliIOProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CliIOProvider();
  });

  describe("promptUser", () => {
    it("delegates to promptForCode", async () => {
      const result = await provider.promptUser("Enter CAPTCHA code");

      expect(promptForCode).toHaveBeenCalledWith("Enter CAPTCHA code");
      expect(result).toBe("abc123");
    });

    it("returns the value from promptForCode", async () => {
      vi.mocked(promptForCode).mockResolvedValueOnce("user-typed-value");

      const result = await provider.promptUser("Type something");

      expect(result).toBe("user-typed-value");
    });
  });

  describe("waitForConfirmation", () => {
    it("delegates to waitForEnter", async () => {
      await provider.waitForConfirmation("Please complete the form");

      expect(waitForEnter).toHaveBeenCalledWith("Please complete the form");
    });

    it("resolves without a value", async () => {
      const result = await provider.waitForConfirmation("Done?");

      expect(result).toBeUndefined();
    });
  });

  describe("log", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("logs info messages with no prefix", () => {
      provider.log("info", "Processing broker");

      expect(consoleSpy).toHaveBeenCalledWith("Processing broker");
    });

    it("logs warn messages with warning prefix", () => {
      provider.log("warn", "Slow response");

      expect(consoleSpy).toHaveBeenCalledWith("    \u26a0 Slow response");
    });

    it("logs error messages with error prefix", () => {
      provider.log("error", "Request failed");

      expect(consoleSpy).toHaveBeenCalledWith("    \u2717 Request failed");
    });

    it("logs success messages with check prefix", () => {
      provider.log("success", "Opt-out submitted");

      expect(consoleSpy).toHaveBeenCalledWith("    \u2713 Opt-out submitted");
    });
  });

  describe("shouldOpenInBrowser", () => {
    it("returns false for a broker with humanInteraction 'browser'", () => {
      const broker: BrokerEntry = {
        name: "TestBroker",
        requirements: ["online"],
        adapter: "generic",
        humanInteraction: "browser",
      };

      expect(provider.shouldOpenInBrowser(broker)).toBe(false);
    });

    it("returns false for a broker with humanInteraction 'modal'", () => {
      const broker: BrokerEntry = {
        name: "TestBroker",
        requirements: ["online"],
        adapter: "generic",
        humanInteraction: "modal",
      };

      expect(provider.shouldOpenInBrowser(broker)).toBe(false);
    });

    it("returns false for a broker without humanInteraction", () => {
      const broker: BrokerEntry = {
        name: "TestBroker",
        requirements: ["online"],
        adapter: "generic",
      };

      expect(provider.shouldOpenInBrowser(broker)).toBe(false);
    });
  });

  describe("openExternal", () => {
    it("resolves without error (no-op)", async () => {
      await expect(provider.openExternal("https://example.com/optout")).resolves.toBeUndefined();
    });
  });
});
