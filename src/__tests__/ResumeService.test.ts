import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResumeService } from "../services/ResumeService.js";
import type { BrokerEntry } from "../types.js";

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

import { promises as fs } from "fs";

function makeBroker(name: string): BrokerEntry {
  return {
    name,
    removalUrl: `https://${name.toLowerCase()}.com/optout`,
    requirements: ["online"],
    adapter: "generic",
  };
}

describe("ResumeService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadSuccessfulBrokers", () => {
    it("returns empty set when no log path provided", async () => {
      const result = await ResumeService.loadSuccessfulBrokers();
      expect(result.size).toBe(0);
    });

    it("returns empty set when log path is undefined", async () => {
      const result = await ResumeService.loadSuccessfulBrokers(undefined);
      expect(result.size).toBe(0);
    });

    it("parses successful brokers from JSONL log", async () => {
      const logContent = [
        '{"site":"Spokeo","status":"success","ts":"2025-01-01"}',
        '{"site":"Whitepages","status":"failed","ts":"2025-01-01"}',
        '{"site":"Radaris","status":"success","ts":"2025-01-01"}',
      ].join("\n");

      vi.mocked(fs.readFile).mockResolvedValue(logContent);

      const result = await ResumeService.loadSuccessfulBrokers("test.jsonl");
      expect(result.size).toBe(2);
      expect(result.has("Spokeo")).toBe(true);
      expect(result.has("Radaris")).toBe(true);
      expect(result.has("Whitepages")).toBe(false);
    });

    it("handles malformed JSON lines gracefully", async () => {
      const logContent = [
        '{"site":"Spokeo","status":"success","ts":"2025-01-01"}',
        "this is not json",
        '{"site":"Radaris","status":"success","ts":"2025-01-01"}',
      ].join("\n");

      vi.mocked(fs.readFile).mockResolvedValue(logContent);

      const result = await ResumeService.loadSuccessfulBrokers("test.jsonl");
      expect(result.size).toBe(2);
    });

    it("returns empty set when file does not exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      const result = await ResumeService.loadSuccessfulBrokers("nonexistent.jsonl");
      expect(result.size).toBe(0);
    });
  });

  describe("filterOutSuccessful", () => {
    it("removes brokers that were already successful", () => {
      const brokers = [makeBroker("Spokeo"), makeBroker("Whitepages"), makeBroker("Radaris")];
      const successful = new Set(["Spokeo", "Radaris"]);

      const result = ResumeService.filterOutSuccessful(brokers, successful);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Whitepages");
    });

    it("returns all brokers when none were successful", () => {
      const brokers = [makeBroker("Spokeo"), makeBroker("Whitepages")];
      const successful = new Set<string>();

      const result = ResumeService.filterOutSuccessful(brokers, successful);
      expect(result).toHaveLength(2);
    });

    it("returns empty when all were successful", () => {
      const brokers = [makeBroker("Spokeo")];
      const successful = new Set(["Spokeo"]);

      const result = ResumeService.filterOutSuccessful(brokers, successful);
      expect(result).toHaveLength(0);
    });
  });
});
