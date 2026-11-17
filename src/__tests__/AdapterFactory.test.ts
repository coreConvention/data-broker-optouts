import { describe, it, expect } from "vitest";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { GenericFormAdapter } from "../adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "../adapters/sites/SpokeoAdapter.js";
import { WhitepagesListingAdapter } from "../adapters/sites/WhitepagesListingAdapter.js";
import { NuwberAdapter } from "../adapters/sites/NuwberAdapter.js";
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

    it("has no run()-style adapter for Whitepages, which is handled by its listing adapter", () => {
      expect(() => AdapterFactory.createAdapter(makeEntry("Whitepages"))).toThrow(/listing adapter/);
    });

    it("creates NuwberAdapter for Nuwber", () => {
      expect(AdapterFactory.createAdapter(makeEntry("Nuwber"))).toBeInstanceOf(NuwberAdapter);
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

  describe("createListingAdapter", () => {
    it("creates the Whitepages listing adapter", () => {
      const adapter = AdapterFactory.createListingAdapter(makeEntry("Whitepages"), { evidenceDir: "data/evidence" });
      expect(adapter).toBeInstanceOf(WhitepagesListingAdapter);
      expect(adapter).toMatchObject({
        brokerId: "whitepages",
        removalWindowDays: 3,
        fields: { scan: ["fullName", "state"], request: [] },
      });
    });

    it("returns null for brokers without a listing adapter", () => {
      const names: BrokerEntry["adapter"][] = ["generic", "Spokeo", "Nuwber", "BeenVerified", "Intelius", "MyLife"];
      for (const name of names) {
        expect(AdapterFactory.createListingAdapter(makeEntry(name))).toBeNull();
      }
    });
  });

  describe("hasAdapter", () => {
    it("returns true for all known adapters", () => {
      const names = ["generic", "Spokeo", "Whitepages", "Nuwber", "BeenVerified", "Intelius", "MyLife"];
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
