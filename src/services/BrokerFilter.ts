import type { BrokerEntry } from "../types.js";

/**
 * Service for filtering broker entries based on user criteria
 * Single Responsibility: Broker filtering logic
 */
export class BrokerFilter {
  /**
   * Filter brokers by inclusion and exclusion criteria
   *
   * @param brokers - Array of broker entries to filter
   * @param filterStr - Comma-separated list of broker names to include
   * @param excludeStr - Comma-separated list of broker names to exclude
   * @returns Filtered array of broker entries
   */
  public static filter(
    brokers: BrokerEntry[],
    filterStr?: string,
    excludeStr?: string
  ): BrokerEntry[] {
    let filtered = [...brokers];

    // Apply inclusion filter
    if (filterStr) {
      const filters = this.parseFilterString(filterStr);
      filtered = filtered.filter(broker =>
        this.matchesAnyFilter(broker.name, filters)
      );
    }

    // Apply exclusion filter
    if (excludeStr) {
      const excludes = this.parseFilterString(excludeStr);
      filtered = filtered.filter(broker =>
        !this.matchesAnyFilter(broker.name, excludes)
      );
    }

    return filtered;
  }

  /**
   * Apply limit to broker array
   *
   * @param brokers - Array of brokers to limit
   * @param limit - Maximum number of brokers to return
   * @returns Limited array of brokers
   */
  public static limit(brokers: BrokerEntry[], limit?: number): BrokerEntry[] {
    if (!limit || limit <= 0) {
      return brokers;
    }

    return brokers.slice(0, limit);
  }

  /**
   * Parse comma-separated filter string into lowercase array
   *
   * @param filterStr - Comma-separated filter string
   * @returns Array of lowercase filter terms
   */
  private static parseFilterString(filterStr: string): string[] {
    return filterStr
      .split(',')
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length > 0);
  }

  /**
   * Check if a broker name matches any of the filters
   *
   * @param brokerName - Name of the broker to check
   * @param filters - Array of filter terms
   * @returns True if broker name matches any filter
   */
  private static matchesAnyFilter(brokerName: string, filters: string[]): boolean {
    const lowerName = brokerName.toLowerCase();
    return filters.some(filter => lowerName.includes(filter));
  }
}
