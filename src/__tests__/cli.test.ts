import { describe, it, expect } from "vitest";
import { parseCliArguments } from "../config/cli.js";

const required = ["--manifest", "data/manifest.json", "--profile", "data/profile.json"];

describe("parseCliArguments", () => {
  it("leaves the verify pass off unless asked for", async () => {
    const options = await parseCliArguments(required);

    expect(options.verify).toBe(false);
    expect(options.dryRun).toBe(false);
  });

  it("--verify asks for the verify pass", async () => {
    const options = await parseCliArguments([...required, "--verify"]);

    expect(options.verify).toBe(true);
    expect(options).toMatchObject({ manifest: "data/manifest.json", profile: "data/profile.json" });
  });

  it("--verify can be combined with a dry run and a broker filter", async () => {
    const options = await parseCliArguments([...required, "--verify", "--dry-run", "--filter", "Whitepages"]);

    expect(options).toMatchObject({ verify: true, dryRun: true, filter: "Whitepages" });
  });
});
