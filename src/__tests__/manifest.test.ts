import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import { ManifestSchema } from "../config/schemas.js";

describe("manifest.json validation", () => {
  it("validates the actual manifest.json against the schema", async () => {
    const content = await fs.readFile("./data/manifest.json", "utf-8");
    const parsed = JSON.parse(content);
    const result = ManifestSchema.safeParse(parsed);

    if (!result.success) {
      console.error("Manifest validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("has no duplicate broker names", async () => {
    const content = await fs.readFile("./data/manifest.json", "utf-8");
    const manifest = JSON.parse(content) as { name: string }[];
    const names = manifest.map((b) => b.name);
    const uniqueNames = new Set(names);

    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    if (duplicates.length > 0) {
      console.error("Duplicate broker names:", duplicates);
    }
    expect(names.length).toBe(uniqueNames.size);
  });

  it("all brokers with online requirement have a removalUrl", async () => {
    const content = await fs.readFile("./data/manifest.json", "utf-8");
    const manifest = JSON.parse(content) as { name: string; removalUrl?: string; requirements: string[] }[];

    const missingUrl = manifest.filter(
      (b) => b.requirements.includes("online") && !b.removalUrl
    );

    if (missingUrl.length > 0) {
      console.error(
        "Brokers with 'online' requirement but no removalUrl:",
        missingUrl.map((b) => b.name)
      );
    }
    expect(missingUrl).toHaveLength(0);
  });

  it("all removalUrls are valid URLs", async () => {
    const content = await fs.readFile("./data/manifest.json", "utf-8");
    const manifest = JSON.parse(content) as { name: string; removalUrl?: string | null }[];

    const invalidUrls: string[] = [];
    for (const broker of manifest) {
      if (broker.removalUrl) {
        try {
          new URL(broker.removalUrl);
        } catch {
          invalidUrls.push(`${broker.name}: ${broker.removalUrl}`);
        }
      }
    }

    if (invalidUrls.length > 0) {
      console.error("Invalid URLs:", invalidUrls);
    }
    expect(invalidUrls).toHaveLength(0);
  });
});
