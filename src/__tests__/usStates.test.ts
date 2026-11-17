import { describe, it, expect } from "vitest";
import { stateCode } from "../utils/usStates.js";

describe("stateCode", () => {
  it("turns a spelled-out state into its code, whatever the case or spacing", () => {
    expect(stateCode("California")).toBe("CA");
    expect(stateCode("  new   york ")).toBe("NY");
    expect(stateCode("DISTRICT OF COLUMBIA")).toBe("DC");
  });

  it("passes a two-letter code through in upper case", () => {
    expect(stateCode("wa")).toBe("WA");
    expect(stateCode("PR")).toBe("PR");
  });

  it("returns null for anything else", () => {
    expect(stateCode("Calif.")).toBeNull();
    expect(stateCode("")).toBeNull();
    expect(stateCode(null)).toBeNull();
    expect(stateCode(undefined)).toBeNull();
  });
});
