import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/**
 * CLI Configuration Interface
 * Represents all command-line options available to the user
 */
export interface CliOptions {
  manifest: string;
  profile: string;
  headful: boolean;
  stealth: boolean;
  filter?: string;
  exclude?: string;
  dryRun: boolean;
  resume?: string;
  limit?: number;
}

/**
 * Parse command-line arguments using yargs
 * Single Responsibility: CLI argument parsing only
 *
 * @returns Parsed and validated CLI options
 */
export async function parseCliArguments(): Promise<CliOptions> {
  const argv = await yargs(hideBin(process.argv))
    .option("manifest", {
      type: "string",
      demandOption: true,
      description: "Path to manifest.json"
    })
    .option("profile", {
      type: "string",
      demandOption: true,
      description: "Path to profile.json"
    })
    .option("headful", {
      type: "boolean",
      default: false,
      description: "Run browser in headful mode (visible)"
    })
    .option("stealth", {
      type: "boolean",
      default: true,
      description: "Enable stealth mode to avoid bot detection"
    })
    .option("filter", {
      type: "string",
      description: "Filter brokers by name (comma-separated)"
    })
    .option("exclude", {
      type: "string",
      description: "Exclude brokers by name (comma-separated)"
    })
    .option("dry-run", {
      type: "boolean",
      default: false,
      description: "Simulate run without actually submitting"
    })
    .option("resume", {
      type: "string",
      description: "Resume from previous log file, skip successful brokers"
    })
    .option("limit", {
      type: "number",
      description: "Limit number of brokers to process"
    })
    .example("$0 --manifest data/manifest.json --profile data/profile.json --headful", "Run in visible mode")
    .example("$0 --filter 'Spokeo,Whitepages' --headful", "Run only Spokeo and Whitepages")
    .example("$0 --exclude 'BeenVerified,Intelius' --headful", "Run all except BeenVerified and Intelius")
    .example("$0 --dry-run --headful", "Test run without submitting")
    .example("$0 --resume optouts-2025-11-05.jsonl --headful", "Resume from previous run")
    .help()
    .parse();

  return {
    manifest: argv.manifest,
    profile: argv.profile,
    headful: argv.headful,
    stealth: argv.stealth,
    ...(argv.filter !== undefined && { filter: argv.filter }),
    ...(argv.exclude !== undefined && { exclude: argv.exclude }),
    dryRun: argv["dry-run"],
    ...(argv.resume !== undefined && { resume: argv.resume }),
    ...(argv.limit !== undefined && { limit: argv.limit }),
  };
}
