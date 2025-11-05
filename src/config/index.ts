/**
 * Configuration Module Barrel Export
 *
 * Provides a single entry point for all configuration-related exports
 * including CLI parsing and schema definitions.
 *
 * @module config
 */

// CLI Configuration
export { parseCliArguments } from "./cli.js";
export type { CliOptions } from "./cli.js";

// Schema Definitions
export { BrokerEntrySchema, ProfileSchema, ManifestSchema } from "./schemas.js";
