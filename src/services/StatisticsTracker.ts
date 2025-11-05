/**
 * Statistics for opt-out execution
 */
export interface ExecutionStatistics {
  success: number;
  failed: number;
  skipped: number;
  manualNeeded: number;
}

/**
 * Service for tracking execution statistics
 * Single Responsibility: Statistics collection and reporting
 */
export class StatisticsTracker {
  private stats: ExecutionStatistics;

  constructor() {
    this.stats = {
      success: 0,
      failed: 0,
      skipped: 0,
      manualNeeded: 0
    };
  }

  /**
   * Record a successful opt-out
   */
  public recordSuccess(): void {
    this.stats.success++;
  }

  /**
   * Record a failed opt-out
   */
  public recordFailure(): void {
    this.stats.failed++;
  }

  /**
   * Record a skipped broker
   */
  public recordSkipped(): void {
    this.stats.skipped++;
  }

  /**
   * Record a broker requiring manual action
   */
  public recordManualNeeded(): void {
    this.stats.manualNeeded++;
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
    return this.stats.success + this.stats.failed + this.stats.skipped + this.stats.manualNeeded;
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
    console.log("=".repeat(60));
  }

  /**
   * Reset all statistics to zero
   */
  public reset(): void {
    this.stats = {
      success: 0,
      failed: 0,
      skipped: 0,
      manualNeeded: 0
    };
  }
}
