/**
 * Services Module Barrel Export
 *
 * Provides a single entry point for all service-related exports
 * including filtering, resume, statistics, orchestration, and configuration loading.
 *
 * @module services
 */

// Broker Filtering
export { BrokerFilter } from "./BrokerFilter.js";

// Resume Service
export { ResumeService } from "./ResumeService.js";

// Statistics Tracking
export { StatisticsTracker } from "./StatisticsTracker.js";
export type { ExecutionStatistics } from "./StatisticsTracker.js";

// Execution Orchestration
export { ExecutionOrchestrator } from "./ExecutionOrchestrator.js";
export type { ExecutionOptions, VerifyTarget } from "./ExecutionOrchestrator.js";

// Configuration Loading
export { ConfigLoader } from "./ConfigLoader.js";

// Broker State File
export { StateStore, StateFileError, personHash } from "./StateStore.js";
export type { StateStoreOptions, ScanOutcome, RequestOutcome, VerifyOutcome } from "./StateStore.js";

// Verify Pass
export { verifyBroker, verifyStatus } from "./VerifyPass.js";
export type { VerifyPassResult } from "./VerifyPass.js";

// Evidence Folder
export { EvidenceStore } from "./EvidenceStore.js";
export type { EvidenceEvent } from "./EvidenceStore.js";
