import type { BrowserContext } from "@playwright/test";
import type { BrokerEntry, PersonProfile, OptOutResult } from "../types.js";
import { Logger } from "../utils/logger.js";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { StatisticsTracker } from "./StatisticsTracker.js";

/**
 * Options for execution orchestrator
 */
export interface ExecutionOptions {
  dryRun: boolean;
  delayBetweenBrokers: number;
}

/**
 * Orchestrates the execution of opt-out requests across multiple brokers
 * Single Responsibility: Coordinate the opt-out process flow
 *
 * Follows Facade Pattern to simplify complex subsystem interactions
 */
export class ExecutionOrchestrator {
  private logger: Logger;
  private statistics: StatisticsTracker;
  private options: ExecutionOptions;

  constructor(logger: Logger, options: ExecutionOptions) {
    this.logger = logger;
    this.statistics = new StatisticsTracker();
    this.options = options;
  }

  /**
   * Execute opt-out requests for all brokers
   *
   * @param brokers - Array of broker entries to process
   * @param profile - User profile data
   * @param context - Browser context for automation
   */
  public async executeAll(
    brokers: BrokerEntry[],
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<void> {
    const totalBrokers = brokers.length;

    for (let i = 0; i < brokers.length; i++) {
      const entry = brokers[i]!;
      const brokerNum = i + 1;

      this.printBrokerHeader(entry, brokerNum, totalBrokers);

      await this.executeBroker(entry, profile, context);

      // Add delay between brokers to avoid rate limiting
      if (i < brokers.length - 1) {
        await this.delayBetweenBrokers();
      }
    }

    this.statistics.printReport(totalBrokers);
  }

  /**
   * Execute opt-out for a single broker
   *
   * @param entry - Broker entry configuration
   * @param profile - User profile data
   * @param context - Browser context
   */
  private async executeBroker(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<void> {
    const result = this.createBaseResult(entry);

    try {
      // Check if broker has online opt-out path
      if (this.shouldSkipBroker(entry)) {
        this.handleSkippedBroker(entry, result);
        return;
      }

      // Check if manual-only broker
      if (this.isManualOnly(entry)) {
        this.handleManualOnlyBroker(entry, result);
        return;
      }

      // Execute opt-out (dry-run or actual)
      if (this.options.dryRun) {
        this.handleDryRun(entry, profile, result);
      } else {
        await this.handleActualExecution(entry, profile, context, result);
      }
    } catch (error) {
      this.handleExecutionError(error, result);
    }
  }

  /**
   * Check if broker should be skipped
   */
  private shouldSkipBroker(entry: BrokerEntry): boolean {
    return !entry.removalUrl &&
      !entry.requirements.includes("email") &&
      !entry.requirements.includes("phone");
  }

  /**
   * Check if broker requires manual action only
   */
  private isManualOnly(entry: BrokerEntry): boolean {
    const hasEmail = entry.requirements.includes("email");
    const hasPhone = entry.requirements.includes("phone");
    const hasOnline = entry.requirements.includes("online");

    return (hasEmail && !hasOnline) || (hasPhone && !hasOnline);
  }

  /**
   * Handle skipped broker
   */
  private handleSkippedBroker(entry: BrokerEntry, result: OptOutResult): void {
    result.status = "skipped";
    result.message = "No online/email/phone path defined.";
    this.logger.append(result);
    this.statistics.recordSkipped();
    console.log(`    ⊘ Skipped: ${result.message}`);
  }

  /**
   * Handle manual-only broker
   */
  private handleManualOnlyBroker(entry: BrokerEntry, result: OptOutResult): void {
    const method = entry.requirements.includes("email") ? "Email" : "Phone";
    result.status = "manual-needed";
    result.message = `${method}-only removal. See notes/website.`;
    this.logger.append(result);
    this.statistics.recordManualNeeded();
    console.log(`    ⚠ Manual needed: ${result.message}`);
  }

  /**
   * Handle dry-run execution
   */
  private handleDryRun(
    entry: BrokerEntry,
    profile: PersonProfile,
    result: OptOutResult
  ): void {
    console.log(`    🧪 [DRY RUN] Would run ${entry.adapter} adapter`);
    console.log(`    🧪 [DRY RUN] Would navigate to: ${entry.removalUrl}`);
    console.log(`    🧪 [DRY RUN] Would fill profile data: ${profile.fullName}, ${profile.email}`);

    result.status = "success";
    result.message = "[DRY RUN] Simulated successful submission";
    this.logger.append(result);
    this.statistics.recordSuccess();
    console.log(`    ✓ Dry run completed`);
  }

  /**
   * Handle actual execution
   */
  private async handleActualExecution(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext,
    result: OptOutResult
  ): Promise<void> {
    const adapter = AdapterFactory.createAdapter(entry);
    await adapter.run(context, profile);

    result.status = "success";
    result.message = "Submitted (some steps may have been manual).";
    this.logger.append(result);
    this.statistics.recordSuccess();
    console.log(`    ✓ Success: ${result.message}`);
  }

  /**
   * Handle execution error
   */
  private handleExecutionError(error: unknown, result: OptOutResult): void {
    result.status = "failed";
    result.message = error instanceof Error ? error.message : "Unknown error";
    this.logger.append(result);
    this.statistics.recordFailure();
    console.log(`    ✗ Failed: ${result.message}`);
  }

  /**
   * Create base result object for a broker
   */
  private createBaseResult(entry: BrokerEntry): OptOutResult {
    return {
      site: entry.name,
      status: "failed",
      ts: new Date().toISOString(),
      ...(entry.removalUrl ? { url: entry.removalUrl } : {})
    };
  }

  /**
   * Print broker processing header
   */
  private printBrokerHeader(entry: BrokerEntry, brokerNum: number, total: number): void {
    console.log(`\n[${brokerNum}/${total}] Processing: ${entry.name}`);
    console.log(`    URL: ${entry.removalUrl || "N/A"}`);
    console.log(`    Adapter: ${entry.adapter}`);
    console.log(`    Requirements: ${entry.requirements.join(", ")}`);
  }

  /**
   * Add delay between brokers
   */
  private async delayBetweenBrokers(): Promise<void> {
    console.log(`    ⏱  Waiting ${this.options.delayBetweenBrokers / 1000} seconds before next site...`);
    await new Promise(resolve => setTimeout(resolve, this.options.delayBetweenBrokers));
  }

  /**
   * Get execution statistics
   */
  public getStatistics(): StatisticsTracker {
    return this.statistics;
  }
}
