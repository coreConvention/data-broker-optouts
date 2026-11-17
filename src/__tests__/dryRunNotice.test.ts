import { describe, it, expect } from "vitest";
import { describeFields, dryRunNotice } from "../utils/dryRunNotice.js";

describe("describeFields", () => {
  it("names one field", () => {
    expect(describeFields(["fullName"])).toBe("name");
  });

  it("joins two fields with 'and'", () => {
    expect(describeFields(["fullName", "state"])).toBe("name and state");
  });

  it("joins three or more with commas and 'and'", () => {
    expect(describeFields(["fullName", "city", "state", "zip"])).toBe("name, city, state and ZIP code");
  });

  it("says so when a step uses nothing from the profile", () => {
    expect(describeFields([])).toBe("nothing from your profile");
  });
});

describe("dryRunNotice", () => {
  it("says that no broker is contacted when none has a listing search", () => {
    expect(dryRunNotice([])).toEqual([
      "DRY RUN MODE: no removal request will be sent.",
      "No broker in this run will be contacted.",
    ]);
  });

  it("names each broker a dry run still searches, and what the search sends", () => {
    const lines = dryRunNotice([{ broker: "Whitepages", fields: ["fullName", "state"] }]);

    expect(lines[0]).toBe("DRY RUN MODE: no removal request will be sent.");
    expect(lines).toContain("A dry run still searches these brokers for your listing:");
    expect(lines).toContain("  - Whitepages (the search sends your name and state)");
    expect(lines).toContain("Every other broker in this run is not contacted.");
  });
});
