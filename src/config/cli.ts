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
  /** Run the verify pass instead of the scan-and-request run. */
  verify: boolean;
  resume?: string;
  limit?: number;
}

/**
 * Parse command-line arguments using yargs
 * Single Responsibility: CLI argument parsing only
 *
 * @param args - The arguments to parse; the process's own by default (tests pass theirs)
 * @returns Parsed and validated CLI options
 */
export async function parseCliArguments(args: string[] = hideBin(process.argv)): Promise<CliOptions> {
  const argv = await yargs(args)
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
      description: "Send no removal request (brokers with a listing search are still searched for your name)"
    })
    .option("verify", {
      type: "boolean",
      default: false,
      description:
        "Check the removal requests whose waiting period has passed; sends no removal request"
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
    .example("$0 --dry-run --headful", "Run without sending any removal request")
    .example("$0 --verify", "Check whether the listings you asked to have removed are gone")
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
    verify: argv.verify,
    ...(argv.resume !== undefined && { resume: argv.resume }),
    ...(argv.limit !== undefined && { limit: argv.limit }),
  };
}
