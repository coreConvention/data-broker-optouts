import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrokerEntry, IOProvider } from "../types.js";
import type { Listing } from "../adapters/ListingAdapter.js";

// Mock the readline-based helpers before importing CliIOProvider
vi.mock("../utils/human.js", () => ({
  waitForEnter: vi.fn().mockResolvedValue(undefined),
  promptForCode: vi.fn().mockResolvedValue("abc123"),
}));

import { CliIOProvider } from "../providers/CliIOProvider.js";
import { waitForEnter, promptForCode } from "../utils/human.js";
import { chooseListings } from "../utils/chooseListings.js";

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

  describe("choosing listings (numbered-list fallback)", () => {
    // Invented listings on a made-up broker.
    const listings: Listing[] = [
      { id: "https://broker.example/p/1", url: "https://broker.example/p/1", summary: "Testy McFixture, 30, Nowhere ZZ" },
      { id: "https://broker.example/p/2", url: "https://broker.example/p/2", summary: "Testy McFixture, 55, Elsewhere ZZ" },
      { id: "https://broker.example/p/3", url: "https://broker.example/p/3", summary: "T. McFixture, 30, Anywhere ZZ" },
    ];
    const request = { broker: "FakeBroker", listings };

    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("has no selectListings of its own, so the fallback is what runs", () => {
      expect("selectListings" in provider).toBe(false);
    });

    it("shows every candidate as a numbered line and asks which are the person's", async () => {
      vi.mocked(promptForCode).mockResolvedValueOnce("none");

      await chooseListings(provider, request);

      const prompt: string = vi.mocked(promptForCode).mock.calls[0]![0];
      expect(prompt).toContain("1. Testy McFixture, 30, Nowhere ZZ");
      expect(prompt).toContain("3. T. McFixture, 30, Anywhere ZZ");
      expect(prompt).toContain("https://broker.example/p/2");
      expect(prompt).toContain("Which of these are you? e.g. 1,3 or none");
    });

    it("returns the listings whose numbers were typed", async () => {
      vi.mocked(promptForCode).mockResolvedValueOnce("1,3");
      expect(await chooseListings(provider, request)).toEqual([listings[0], listings[2]]);
    });

    it("accepts spaces, repeats and any order", async () => {
      vi.mocked(promptForCode).mockResolvedValueOnce(" 3 , 1 3 ");
      expect(await chooseListings(provider, request)).toEqual([listings[0], listings[2]]);
    });

    it.each(["none", "NONE", "", "0", "n"])("selects nothing for %j", async (answer) => {
      vi.mocked(promptForCode).mockResolvedValueOnce(answer);
      expect(await chooseListings(provider, request)).toEqual([]);
      expect(promptForCode).toHaveBeenCalledTimes(1);
    });

    it("asks again after an answer it cannot read", async () => {
      vi.mocked(promptForCode).mockResolvedValueOnce("the second one").mockResolvedValueOnce("2");

      expect(await chooseListings(provider, request)).toEqual([listings[1]]);
      expect(promptForCode).toHaveBeenCalledTimes(2);
    });

    it.each(["4", "1,9", "-1", "1.5", "all", "1,two"])("does not guess from %j", async (answer) => {
      vi.mocked(promptForCode).mockResolvedValueOnce(answer).mockResolvedValueOnce("none");

      expect(await chooseListings(provider, request)).toEqual([]);
      expect(promptForCode).toHaveBeenCalledTimes(2);
    });

    it("selects nothing after three answers it cannot read", async () => {
      vi.mocked(promptForCode).mockResolvedValue("yes");

      expect(await chooseListings(provider, request)).toEqual([]);
      expect(promptForCode).toHaveBeenCalledTimes(3);
    });

    it("does not prompt when there is nothing to choose from", async () => {
      expect(await chooseListings(provider, { broker: "FakeBroker", listings: [] })).toEqual([]);
      expect(promptForCode).not.toHaveBeenCalled();
    });

    it("uses a provider's own selectListings when it has one, ignoring ids that were not shown", async () => {
      const selectListings = vi.fn().mockResolvedValue(["https://broker.example/p/2", "https://broker.example/p/made-up"]);
      const io: IOProvider = Object.assign(new CliIOProvider(), { selectListings });

      expect(await chooseListings(io, request)).toEqual([listings[1]]);
      expect(selectListings).toHaveBeenCalledWith(request);
      expect(promptForCode).not.toHaveBeenCalled();
    });
  });

  describe("openExternal", () => {
    it("resolves without error (no-op)", async () => {
      await expect(provider.openExternal("https://example.com/optout")).resolves.toBeUndefined();
    });
  });
});
