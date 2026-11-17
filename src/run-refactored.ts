#!/usr/bin/env node

/**
 * Data Broker Opt-Out Runner - Main Entry Point
 *
 * This file serves as the application entry point and coordinates
 * various services to execute the opt-out process.
 *
 * Architecture follows SOLID principles:
 * - Single Responsibility: Each service has one clear purpose
 * - Open/Closed: Easy to extend with new adapters/services
 * - Liskov Substitution: Adapters are interchangeable via BaseAdapter
 * - Interface Segregation: Services expose only needed methods
 * - Dependency Inversion: Depends on abstractions (interfaces/types)
 */

import { parseCliArguments } from "./config/index.js";
import path from "path";
import { ConfigLoader, BrokerFilter, ResumeService, ExecutionOrchestrator, StateStore } from "./services/index.js";
import type { VerifyTarget } from "./services/index.js";
import { AdapterFactory, BrowserFactory } from "./factories/index.js";
import { Logger } from "./utils/logger.js";
import { CliIOProvider } from "./providers/index.js";
import { describeProfile } from "./utils/profileSummary.js";
import { dryRunNotice } from "./utils/dryRunNotice.js";
import type { SearchedBroker } from "./utils/dryRunNotice.js";
import type { PersonProfile } from "./types.js";

/**
 * Main application function
 * Orchestrates all services to execute the opt-out process
 */
async function main(): Promise<void> {
  // Print application header
  printHeader();

  try {
    // Step 1: Parse CLI arguments
    const cliOptions = await parseCliArguments();

    // Step 2: Initialize logger
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const logger = new Logger("./", `optouts-${timestamp}.jsonl`);

    // Step 3: Load configuration files
    const { manifest, profile } = await ConfigLoader.loadAll(
      cliOptions.manifest,
      cliOptions.profile
    );

    console.log(`\n📋 Loaded ${manifest.length} data brokers from manifest`);

    // The state file sits next to the profile. An unreadable one stops the
    // run here, before any browser opens.
    const stateStore = await StateStore.load(path.join(path.dirname(cliOptions.profile), "state.json"), profile);
    if (stateStore.personChanged) {
      console.log("ℹ️  The state file was written for a different profile; every broker starts as unknown.");
    }

    // Step 4: Load resume data if specified
    const successfulBrokers = await ResumeService.loadSuccessfulBrokers(cliOptions.resume);

    // Step 5: Apply filters to broker list
    let filteredBrokers = BrokerFilter.filter(
      manifest,
      cliOptions.filter,
      cliOptions.exclude
    );

    // Step 6: Remove already-successful brokers if resuming
    const originalCount = filteredBrokers.length;
    if (cliOptions.resume && successfulBrokers.size > 0) {
      filteredBrokers = ResumeService.filterOutSuccessful(filteredBrokers, successfulBrokers);
      console.log(`⏭️  Skipping ${successfulBrokers.size} already successful brokers`);
    }

    // Step 7: Apply limit
    filteredBrokers = BrokerFilter.limit(filteredBrokers, cliOptions.limit);

    // Step 8: Print filtering summary
    printFilteringSummary(manifest.length, originalCount, filteredBrokers.length, cliOptions);

    // Step 9: Validate we have brokers to process
    if (filteredBrokers.length === 0) {
      console.log("❌ No brokers to process after filtering");
      process.exit(0);
    }

    const ioProvider = new CliIOProvider();
    const orchestrator = new ExecutionOrchestrator(logger, {
      dryRun: cliOptions.dryRun,
      delayBetweenBrokers: 2000
    }, ioProvider, {
      stateStore,
      evidenceDir: path.join(path.dirname(cliOptions.profile), "evidence")
    });

    // Step 10: Print execution configuration. The verify pass is a run of
    // its own: it checks requests already made and sends nothing, and the
    // browser opens only when a request is ready to check.
    let verifyDue: VerifyTarget[] | null = null;
    if (cliOptions.verify) {
      printVerifyConfig(profile, cliOptions.dryRun, logger.path());
      verifyDue = orchestrator.verifyTargets(filteredBrokers);
      if (verifyDue.length === 0) {
        console.log("\nNo removal request is ready to check.");
        return;
      }
    } else {
      // A dry run still searches the brokers that have a listing adapter, so
      // they are named up front (#63).
      const searched: SearchedBroker[] = filteredBrokers.flatMap((entry) => {
        const adapter = AdapterFactory.createListingAdapter(entry);
        return adapter ? [{ broker: entry.name, fields: adapter.fields.scan }] : [];
      });
      printExecutionConfig(profile, cliOptions, logger.path(), searched);
    }

    // Step 11: Create browser and context
    const { browser, context } = await BrowserFactory.createBrowserWithContext({
      headful: cliOptions.headful,
      stealth: cliOptions.stealth
    });

    if (cliOptions.stealth) {
      console.log(`🥷 Stealth configurations applied`);
    }

    // Step 12: Check the requests that are due, or execute opt-outs
    if (verifyDue) {
      await orchestrator.verifyDue(verifyDue, profile, context);
    } else {
      await orchestrator.executeAll(filteredBrokers, profile, context);
    }

    // Step 13: Cleanup
    await context.close();
    await browser.close();

    // Step 14: Print final log location
    console.log(`\n📝 Audit log written to: ${logger.path()}`);

  } catch (error) {
    console.error("\n❌ Fatal error:");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

/**
 * Print application header
 */
function printHeader(): void {
  console.log("=".repeat(60));
  console.log("🚀 Data Broker Opt-Out Runner");
  console.log("=".repeat(60));
}

/**
 * Print filtering summary
 */
function printFilteringSummary(
  total: number,
  afterFilters: number,
  final: number,
  options: { filter?: string; exclude?: string; limit?: number }
): void {
  if (options.filter || options.exclude) {
    console.log(`🔍 Filtered: ${total} → ${afterFilters} brokers`);
  }

  if (options.limit && options.limit > 0 && afterFilters > final) {
    console.log(`🔢 Limited to first ${final} brokers`);
  }
}

/**
 * Print execution configuration
 */
function printExecutionConfig(
  profile: PersonProfile,
  options: { headful: boolean; stealth: boolean; dryRun: boolean },
  logPath: string,
  searched: readonly SearchedBroker[]
): void {
  console.log(`👤 Profile: ${describeProfile(profile)}`);
  console.log(`🌐 Browser mode: ${options.headful ? "Headful (visible)" : "Headless"}`);
  console.log(`🥷 Stealth mode: ${options.stealth ? "Enabled" : "Disabled"}`);

  if (options.dryRun) {
    const [headline, ...rest] = dryRunNotice(searched);
    console.log(`🧪 ${headline}`);
    for (const line of rest) {
      console.log(`   ${line}`);
    }
  }

  console.log(`📝 Log file: ${logPath}`);
  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Print what a verify pass is about to do
 */
function printVerifyConfig(profile: PersonProfile, dryRun: boolean, logPath: string): void {
  console.log(`👤 Profile: ${describeProfile(profile)}`);
  console.log("🔎 Verify pass: checking removal requests whose waiting period has passed.");
  console.log("   No removal request is sent. A listing that is gone is recorded as");
  console.log("   \"not found when checked\", which is all a look can tell.");
  if (dryRun) {
    console.log("🧪 DRY RUN MODE: no broker will be contacted and nothing will be recorded.");
  }
  console.log(`📝 Log file: ${logPath}`);
  console.log("\n" + "=".repeat(60) + "\n");
}

// Execute main function and handle errors
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
