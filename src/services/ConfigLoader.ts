import { promises as fs } from "fs";
import type { BrokerEntry, PersonProfile } from "../types.js";
import { ManifestSchema, ProfileSchema } from "../config/schemas.js";

/**
 * Service for loading and validating configuration files
 * Single Responsibility: File loading and schema validation
 */
export class ConfigLoader {
  /**
   * Load and validate manifest file
   *
   * @param filePath - Path to manifest.json
   * @returns Validated array of broker entries
   * @throws Error if file cannot be read or validation fails
   */
  public static async loadManifest(filePath: string): Promise<BrokerEntry[]> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = ManifestSchema.parse(parsed) as BrokerEntry[];

      return validated;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load manifest from ${filePath}: ${error.message}`);
      }
      throw new Error(`Failed to load manifest from ${filePath}: Unknown error`);
    }
  }

  /**
   * Load and validate profile file
   *
   * @param filePath - Path to profile.json
   * @returns Validated person profile
   * @throws Error if file cannot be read or validation fails
   */
  public static async loadProfile(filePath: string): Promise<PersonProfile> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = ProfileSchema.parse(parsed) as PersonProfile;

      return validated;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load profile from ${filePath}: ${error.message}`);
      }
      throw new Error(`Failed to load profile from ${filePath}: Unknown error`);
    }
  }

  /**
   * Load both manifest and profile files
   *
   * @param manifestPath - Path to manifest.json
   * @param profilePath - Path to profile.json
   * @returns Object containing manifest and profile
   */
  public static async loadAll(
    manifestPath: string,
    profilePath: string
  ): Promise<{ manifest: BrokerEntry[]; profile: PersonProfile }> {
    const [manifest, profile] = await Promise.all([
      this.loadManifest(manifestPath),
      this.loadProfile(profilePath)
    ]);

    return { manifest, profile };
  }
}
