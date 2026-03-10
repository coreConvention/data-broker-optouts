import { describe, it, expect } from "vitest";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { GenericFormAdapter } from "../adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "../adapters/sites/SpokeoAdapter.js";
import { WhitepagesAdapter } from "../adapters/sites/WhitepagesAdapter.js";
import { NuwberAdapter } from "../adapters/sites/NuwberAdapter.js";
import { RadarisAdapter } from "../adapters/sites/RadarisAdapter.js";
import { BeenVerifiedAdapter } from "../adapters/sites/BeenVerifiedAdapter.js";
import { InteliusAdapter } from "../adapters/sites/InteliusAdapter.js";
import { MyLifeAdapter } from "../adapters/sites/MyLifeAdapter.js";
import type { BrokerEntry } from "../types.js";

function makeEntry(adapter: BrokerEntry["adapter"]): BrokerEntry {
  return {
    name: "Test",
    removalUrl: "https://example.com/optout",
    requirements: ["online"],
    adapter,
  };
}

describe("AdapterFactory", () => {
  describe("createAdapter", () => {
    it("creates SpokeoAdapter for Spokeo", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Spokeo"))).toBeInstanceOf(SpokeoAdapter);
    });

    it("creates WhitepagesAdapter for Whitepages", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Whitepages"))).toBeInstanceOf(WhitepagesAdapter);
    });

    it("creates NuwberAdapter for Nuwber", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Nuwber"))).toBeInstanceOf(NuwberAdapter);
    });

    it("creates RadarisAdapter for Radaris", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Radaris"))).toBeInstanceOf(RadarisAdapter);
    });

    it("creates BeenVerifiedAdapter for BeenVerified", () => {
      expect(AdapterFactory.createAdapter(makeEntry("BeenVerified"))).toBeInstanceOf(BeenVerifiedAdapter);
    });

    it("creates InteliusAdapter for Intelius", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Intelius"))).toBeInstanceOf(InteliusAdapter);
    });

    it("creates MyLifeAdapter for MyLife", () => {
      expect(AdapterFactory.createAdapter(makeEntry("MyLife"))).toBeInstanceOf(MyLifeAdapter);
    });

    it("creates GenericFormAdapter for generic", () => {
      expect(AdapterFactory.createAdapter(makeEntry("generic"))).toBeInstanceOf(GenericFormAdapter);
    });
  });

  describe("hasAdapter", () => {
    it("returns true for all known adapters", () => {
      const names = ["generic", "Spokeo", "Whitepages", "Nuwber", "Radaris", "BeenVerified", "Intelius", "MyLife"];
      for (const name of names) {
        expect(AdapterFactory.hasAdapter(name)).toBe(true);
      }
    });

    it("returns false for unknown adapter names", () => {
      expect(AdapterFactory.hasAdapter("Unknown")).toBe(false);
      expect(AdapterFactory.hasAdapter("")).toBe(false);
    });
  });
});
