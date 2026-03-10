import { describe, it, expect, beforeEach } from "vitest";
import { StatisticsTracker } from "../services/StatisticsTracker.js";

describe("StatisticsTracker", () => {
  let tracker: StatisticsTracker;

  beforeEach(() => {
    tracker = new StatisticsTracker();
  });

  it("starts with all zeros", () => {
    const stats = tracker.getStatistics();
    expect(stats.success).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.manualNeeded).toBe(0);
  });

  it("records successes", () => {
    tracker.recordSuccess();
    tracker.recordSuccess();
    expect(tracker.getStatistics().success).toBe(2);
  });

  it("records failures", () => {
    tracker.recordFailure();
    expect(tracker.getStatistics().failed).toBe(1);
  });

  it("records skipped", () => {
    tracker.recordSkipped();
    tracker.recordSkipped();
    tracker.recordSkipped();
    expect(tracker.getStatistics().skipped).toBe(3);
  });

  it("records manual needed", () => {
    tracker.recordManualNeeded();
    expect(tracker.getStatistics().manualNeeded).toBe(1);
  });

  it("calculates total processed", () => {
    tracker.recordSuccess();
    tracker.recordSuccess();
    tracker.recordFailure();
    tracker.recordSkipped();
    tracker.recordManualNeeded();
    expect(tracker.getTotalProcessed()).toBe(5);
  });

  it("returns a copy from getStatistics (not a reference)", () => {
    tracker.recordSuccess();
    const stats1 = tracker.getStatistics();
    tracker.recordSuccess();
    const stats2 = tracker.getStatistics();
    expect(stats1.success).toBe(1);
    expect(stats2.success).toBe(2);
  });

  it("resets all counters", () => {
    tracker.recordSuccess();
    tracker.recordFailure();
    tracker.recordSkipped();
    tracker.recordManualNeeded();
    tracker.reset();
    expect(tracker.getTotalProcessed()).toBe(0);
  });
});
