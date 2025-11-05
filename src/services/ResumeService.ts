import { promises as fs } from "fs";
import type { OptOutResult, BrokerEntry } from "../types.js";

/**
 * Service for handling resume functionality
 * Single Responsibility: Parse previous logs and filter successful brokers
 */
export class ResumeService {
  /**
   * Load successful broker names from a previous log file
   *
   * @param logPath - Path to JSONL log file
   * @returns Set of broker names that were successful
   */
  public static async loadSuccessfulBrokers(logPath?: string): Promise<Set<string>> {
    const successful = new Set<string>();

    if (!logPath) {
      return successful;
    }

    try {
      const logContent = await fs.readFile(logPath, "utf-8");
      const lines = logContent.trim().split("\n");

      for (const line of lines) {
        const entry = this.parseLogLine(line);
        if (entry && entry.status === "success") {
          successful.add(entry.site);
        }
      }

      console.log(`📂 Loaded ${successful.size} successful brokers from ${logPath}`);
    } catch (error) {
      console.log(`⚠️  Could not load resume file: ${logPath}`);
      console.log(`    Reason: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    return successful;
  }

  /**
   * Filter out brokers that have already been successfully processed
   *
   * @param brokers - Array of broker entries
   * @param successfulBrokers - Set of broker names that were successful
   * @returns Filtered array excluding successful brokers
   */
  public static filterOutSuccessful(
    brokers: BrokerEntry[],
    successfulBrokers: Set<string>
  ): BrokerEntry[] {
    return brokers.filter(broker => !successfulBrokers.has(broker.name));
  }

  /**
   * Parse a single log line into an OptOutResult
   *
   * @param line - JSON string representing a log entry
   * @returns Parsed OptOutResult or null if invalid
   */
  private static parseLogLine(line: string): OptOutResult | null {
    try {
      return JSON.parse(line) as OptOutResult;
    } catch {
      return null;
    }
  }
}
