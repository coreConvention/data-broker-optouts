import type { OptOutResult } from "../types.js";

/**
 * Statistics for opt-out execution.
 *
 * The first four count brokers on the older adapter path. The rest count
 * brokers handled through a listing adapter, by the broker state the run
 * left them in (design plan section 5.1).
 */
export interface ExecutionStatistics {
  success: number;
  failed: number;
  skipped: number;
  manualNeeded: number;
  unknown: number;
  notFound: number;
  listed: number;
  requested: number;
  removed: number;
  relisted: number;
}

/** Which counter each run-log status feeds. */
const COUNTER_FOR_STATUS: Record<OptOutResult["status"], keyof ExecutionStatistics> = {
  success: "success",
  failed: "failed",
  skipped: "skipped",
  "manual-needed": "manualNeeded",
  unknown: "unknown",
  "not-found": "notFound",
  listed: "listed",
  requested: "requested",
  removed: "removed",
  relisted: "relisted"
};

function emptyStatistics(): ExecutionStatistics {
  return {
    success: 0,
    failed: 0,
    skipped: 0,
    manualNeeded: 0,
    unknown: 0,
    notFound: 0,
    listed: 0,
    requested: 0,
    removed: 0,
    relisted: 0
  };
}

/**
 * Service for tracking execution statistics
 * Single Responsibility: Statistics collection and reporting
 */
export class StatisticsTracker {
  private stats: ExecutionStatistics;

  constructor() {
    this.stats = emptyStatistics();
  }

  /**
   * Record one broker's outcome by its run-log status
   *
   * @param status - The status written to the run log for the broker
   */
  public record(status: OptOutResult["status"]): void {
    this.stats[COUNTER_FOR_STATUS[status]]++;
  }

  /**
   * Record a successful opt-out
   */
  public recordSuccess(): void {
    this.record("success");
  }

  /**
   * Record a failed opt-out
   */
  public recordFailure(): void {
    this.record("failed");
  }

  /**
   * Record a skipped broker
   */
  public recordSkipped(): void {
    this.record("skipped");
  }

  /**
   * Record a broker requiring manual action
   */
  public recordManualNeeded(): void {
    this.record("manual-needed");
  }

  /**
   * Get current statistics
   *
   * @returns Current execution statistics
   */
  public getStatistics(): Readonly<ExecutionStatistics> {
    return { ...this.stats };
  }

  /**
   * Get total number of brokers processed
   *
   * @returns Total count
   */
  public getTotalProcessed(): number {
    return Object.values(this.stats).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Print formatted statistics report
   *
   * @param totalBrokers - Total number of brokers in manifest
   */
  public printReport(totalBrokers: number): void {
    console.log("\n" + "=".repeat(60));
    console.log("📊 Summary Report");
    console.log("=".repeat(60));
    console.log(`Total brokers processed: ${totalBrokers}`);
    console.log(`✓ Successful: ${this.stats.success}`);
    console.log(`✗ Failed: ${this.stats.failed}`);
    console.log(`⊘ Skipped: ${this.stats.skipped}`);
    console.log(`⚠ Manual needed: ${this.stats.manualNeeded}`);

    // Listing-adapter brokers, shown only when the run handled any.
    const listingLines: [string, number][] = [
      ["Removal requested", this.stats.requested],
      ["Listed, no request outstanding", this.stats.listed],
      ["Listed again after removal", this.stats.relisted],
      ["Not found when we looked", this.stats.notFound],
      // Never "deleted": the tool only knows it looked and did not see the listing.
      ["Not found when checked after a removal request", this.stats.removed],
      ["Could not tell", this.stats.unknown]
    ];
    for (const [label, count] of listingLines) {
      if (count > 0) console.log(`• ${label}: ${count}`);
    }
    console.log("=".repeat(60));
  }

  /**
   * Reset all statistics to zero
   */
  public reset(): void {
    this.stats = emptyStatistics();
  }
}
