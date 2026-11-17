import type { BrowserContext } from "@playwright/test";
import type { BrokerEntry, PersonProfile, OptOutResult, IOProvider, ExecutionContext } from "../types.js";
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
  private ioProvider: IOProvider;
  private shouldStop = false;
  private isPaused = false;

  constructor(logger: Logger, options: ExecutionOptions, ioProvider: IOProvider) {
    this.logger = logger;
    this.statistics = new StatisticsTracker();
    this.options = options;
    this.ioProvider = ioProvider;
  }

  /**
   * Request the orchestrator to stop processing after the current broker
   */
  public requestStop(): void {
    this.shouldStop = true;
  }

  /**
   * Request the orchestrator to pause between brokers
   */
  public requestPause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing after a pause
   */
  public requestResume(): void {
    this.isPaused = false;
  }

  /**
   * Check if paused, waiting until resumed or stopped.
   * Returns true if the run should stop.
   */
  private async checkPauseAndStop(): Promise<boolean> {
    while (this.isPaused && !this.shouldStop) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.shouldStop;
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
      if (await this.checkPauseAndStop()) {
        this.ioProvider.log("warn", "Run stopped by user.");
        break;
      }

      const entry = brokers[i]!;
      const brokerNum = i + 1;

      this.printBrokerHeader(entry, brokerNum, totalBrokers);
      this.ioProvider.reportProgress?.({
        current: i,
        total: totalBrokers,
        broker: entry.name,
        status: "processing"
      });

      const result = await this.executeBroker(entry, profile, context);
      this.ioProvider.reportProgress?.({
        current: brokerNum,
        total: totalBrokers,
        broker: entry.name,
        status: result.status,
        ...(result.message ? { message: result.message } : {})
      });

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
   * @returns The broker's result, with its final status and message
   */
  private async executeBroker(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<OptOutResult> {
    const result = this.createBaseResult(entry);

    try {
      // Check if broker has online opt-out path
      if (this.shouldSkipBroker(entry)) {
        await this.handleSkippedBroker(entry, result);
        return result;
      }

      // Check if manual-only broker
      if (this.isManualOnly(entry)) {
        await this.handleManualOnlyBroker(entry, result);
        return result;
      }

      // Execute opt-out (dry-run or actual)
      if (this.options.dryRun) {
        await this.handleDryRun(entry, profile, result);
      } else {
        await this.handleActualExecution(entry, profile, context, result);
      }
    } catch (error) {
      await this.handleExecutionError(error, result);
    }

    return result;
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
  private async handleSkippedBroker(entry: BrokerEntry, result: OptOutResult): Promise<void> {
    result.status = "skipped";
    result.message = "No online/email/phone path defined.";
    await this.recordResult(result);
    this.statistics.recordSkipped();
    this.ioProvider.log("warn", `Skipped: ${result.message}`);
  }

  /**
   * Handle manual-only broker
   */
  private async handleManualOnlyBroker(entry: BrokerEntry, result: OptOutResult): Promise<void> {
    const method = entry.requirements.includes("email") ? "Email" : "Phone";
    result.status = "manual-needed";
    result.message = `${method}-only removal. See notes/website.`;
    await this.recordResult(result);
    this.statistics.recordManualNeeded();
    this.ioProvider.log("warn", `Manual needed: ${result.message}`);
  }

  /**
   * Handle dry-run execution
   */
  private async handleDryRun(
    entry: BrokerEntry,
    profile: PersonProfile,
    result: OptOutResult
  ): Promise<void> {
    this.ioProvider.log("info", `[DRY RUN] Would run ${entry.adapter} adapter`);
    this.ioProvider.log("info", `[DRY RUN] Would navigate to: ${entry.removalUrl}`);
    this.ioProvider.log("info", `[DRY RUN] Would fill profile data: ${profile.fullName}, ${profile.email}`);

    result.status = "success";
    result.message = "[DRY RUN] Simulated successful submission";
    await this.recordResult(result);
    this.statistics.recordSuccess();
    this.ioProvider.log("info", "Dry run completed");
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
    const execContext: ExecutionContext = { ioProvider: this.ioProvider };
    await adapter.run(context, profile, execContext);

    result.status = "success";
    result.message = "Submitted (some steps may have been manual).";
    await this.recordResult(result);
    this.statistics.recordSuccess();
    this.ioProvider.log("success", `${entry.name}: ${result.message}`);
  }

  /**
   * Handle execution error
   */
  private async handleExecutionError(error: unknown, result: OptOutResult): Promise<void> {
    result.status = "failed";
    result.message = error instanceof Error ? error.message : "Unknown error";
    await this.recordResult(result);
    this.statistics.recordFailure();
    this.ioProvider.log("error", `Failed: ${result.message}`);
  }

  /**
   * Write a broker's result line to the run log.
   *
   * Never throws: the log is a record of what happened, not part of the
   * opt-out itself. A write failure (folder missing, read-only, disk full)
   * is reported to the user, but it must not turn a submitted opt-out into
   * a "failed" one, and it must not abort the remaining brokers.
   */
  private async recordResult(result: OptOutResult): Promise<void> {
    try {
      await this.logger.append(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.ioProvider.log("error", `Could not write result log for ${result.site}: ${reason}`);
    }
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
    this.ioProvider.log("info", `\n[${brokerNum}/${total}] Processing: ${entry.name}`);
    this.ioProvider.log("info", `    URL: ${entry.removalUrl || "N/A"}`);
    this.ioProvider.log("info", `    Adapter: ${entry.adapter}`);
    this.ioProvider.log("info", `    Requirements: ${entry.requirements.join(", ")}`);
  }

  /**
   * Add delay between brokers
   */
  private async delayBetweenBrokers(): Promise<void> {
    this.ioProvider.log("info", `Waiting ${this.options.delayBetweenBrokers / 1000} seconds before next site...`);
    await new Promise(resolve => setTimeout(resolve, this.options.delayBetweenBrokers));
  }

  /**
   * Get execution statistics
   */
  public getStatistics(): StatisticsTracker {
    return this.statistics;
  }
}
