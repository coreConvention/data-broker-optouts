import { describe, it, expect } from "vitest";
import { BrokerFilter } from "../services/BrokerFilter.js";
import type { BrokerEntry } from "../types.js";

function makeBroker(name: string): BrokerEntry {
  return {
    name,
    removalUrl: `https://${name.toLowerCase()}.com/optout`,
    requirements: ["online"],
    adapter: "generic",
  };
}

const brokers: BrokerEntry[] = [
  makeBroker("Spokeo"),
  makeBroker("Whitepages"),
  makeBroker("BeenVerified"),
  makeBroker("Radaris"),
  makeBroker("FastPeopleSearch"),
];

describe("BrokerFilter", () => {
  describe("filter", () => {
    it("returns all brokers when no filters are specified", () => {
      const result = BrokerFilter.filter(brokers);
      expect(result).toHaveLength(5);
    });

    it("filters by inclusion string (case-insensitive)", () => {
      const result = BrokerFilter.filter(brokers, "spokeo,radaris");
      expect(result.map((b) => b.name)).toEqual(["Spokeo", "Radaris"]);
    });

    it("filters by partial name match", () => {
      const result = BrokerFilter.filter(brokers, "people");
      expect(result.map((b) => b.name)).toEqual(["FastPeopleSearch"]);
    });

    it("excludes specified brokers", () => {
      const result = BrokerFilter.filter(brokers, undefined, "spokeo,whitepages");
      expect(result.map((b) => b.name)).toEqual([
        "BeenVerified",
        "Radaris",
        "FastPeopleSearch",
      ]);
    });

    it("combines include and exclude filters", () => {
      const result = BrokerFilter.filter(brokers, "spokeo,radaris,whitepages", "radaris");
      expect(result.map((b) => b.name)).toEqual(["Spokeo", "Whitepages"]);
    });

    it("returns empty array when filter matches nothing", () => {
      const result = BrokerFilter.filter(brokers, "nonexistent");
      expect(result).toHaveLength(0);
    });

    it("handles empty filter string gracefully", () => {
      const result = BrokerFilter.filter(brokers, "");
      expect(result).toHaveLength(5);
    });

    it("does not mutate the original array", () => {
      const original = [...brokers];
      BrokerFilter.filter(brokers, "spokeo");
      expect(brokers).toEqual(original);
    });
  });

  describe("limit", () => {
    it("returns all brokers when limit is not specified", () => {
      const result = BrokerFilter.limit(brokers);
      expect(result).toHaveLength(5);
    });

    it("limits to specified count", () => {
      const result = BrokerFilter.limit(brokers, 2);
      expect(result).toHaveLength(2);
      expect(result.map((b) => b.name)).toEqual(["Spokeo", "Whitepages"]);
    });

    it("returns all when limit exceeds array length", () => {
      const result = BrokerFilter.limit(brokers, 100);
      expect(result).toHaveLength(5);
    });

    it("returns all when limit is 0", () => {
      const result = BrokerFilter.limit(brokers, 0);
      expect(result).toHaveLength(5);
    });

    it("returns all when limit is negative", () => {
      const result = BrokerFilter.limit(brokers, -1);
      expect(result).toHaveLength(5);
    });
  });
});
