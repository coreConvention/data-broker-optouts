import { describe, it, expect } from "vitest";
import type { PersonProfile } from "../types.js";
import { describeProfile } from "../utils/profileSummary.js";

describe("describeProfile (CLI start-up summary)", () => {
  it("names the optional fields that are filled in, and none of their values", () => {
    const profile: PersonProfile = {
      fullName: "Zephyrine Quillfeather",
      email: "zq-primary@example.test",
      altEmails: ["zq-alternate@example.test"],
      phone: "555-0142-7791",
      address: "4471 Wobblestone Crescent",
      city: "Marrowgate",
      state: "ZQ",
      zip: "99887",
    };

    const summary: string = describeProfile(profile);

    expect(summary).toBe("loaded (optional fields present: city, state, zip, phone, address, altEmails)");
    for (const value of Object.values(profile).flat().map(String)) {
      expect(summary).not.toContain(value);
    }
  });

  it("treats null, empty and missing optional fields as absent", () => {
    const profile: PersonProfile = {
      fullName: "Zephyrine Quillfeather",
      email: "zq-primary@example.test",
      city: null,
      phone: "",
      altEmails: [],
    };

    expect(describeProfile(profile)).toBe("loaded (no optional fields present)");
  });
});
