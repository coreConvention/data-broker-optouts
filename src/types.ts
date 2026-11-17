import type { Listing } from "./adapters/ListingAdapter.js";

export type BrokerRequirement =
  | "online"
  | "email"
  | "phone"
  | "captcha"
  | "email-verification"
  | "phone-verification"
  | "id-upload"
  | "id-verification"
  | "account-required"
  | "email-only"
  | "phone-only"
  | "profile-url-required"
  | "unknown";

/**
 * What an entry's opt-out does. Mirrors BrokerCategorySchema in
 * config/schemas.ts; only "people-search" removes a public listing.
 */
export type BrokerCategory = "people-search" | "marketing" | "ad-tech" | "credit" | "b2b";

export interface BrokerEntry {
  name: string;
  /** What kind of opt-out this is; only "people-search" removes a public listing. */
  category?: BrokerCategory;
  removalUrl?: string | null;
  requirements: BrokerRequirement[];
  adapter: "generic" | "Spokeo" | "Whitepages" | "Nuwber" | "BeenVerified" | "Intelius" | "MyLife";
  notes?: string | null;
  humanInteraction?: HumanInteractionMode;
  /**
   * True only when a person has checked this entry's selectors against the
   * broker's live opt-out page. Absent means false. The generic adapter types
   * and clicks nothing for an unverified entry: it opens the page and hands
   * over to the person (issue #25).
   */
  verified?: boolean;
  config?: {
    selectors?: {
      name?: string;
      email?: string;
      city?: string;
      state?: string;
      zip?: string;
      address?: string;
      phone?: string;
      submit?: string;
    };
    checkboxes?: string[];
    postSubmitWaitMs?: number;
  };
}

export interface PersonProfile {
  fullName: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email: string;
  altEmails?: string[];
  phone?: string | null;
  address?: string | null;
}

export interface OptOutResult {
  site: string;
  /**
   * One line of the run log. A broker handled through a listing adapter
   * reports its broker state (BrokerState); brokers on the older adapter path
   * still report "success", which only means the adapter did not throw.
   */
  status: "success" | "manual-needed" | "skipped" | "failed" | BrokerState;
  message?: string;
  url?: string;
  ts: string;
}

/**
 * What an adapter did for a broker: "submitted" when it sent the opt-out
 * itself, "manual" when it opened the page and left the opt-out to the person.
 */
export type AdapterOutcome = "submitted" | "manual";

export type HumanInteractionMode = "modal" | "browser";

/**
 * Per-broker progress of a run, reported through IOProvider.reportProgress.
 *
 * `current` counts brokers already finished, so a progress bar driven by
 * current / total only reaches 100% once the last broker is done. A broker
 * is reported twice: as "processing" when it starts, then with its outcome.
 */
export interface RunProgress {
  current: number;
  total: number;
  broker: string;
  status: "processing" | OptOutResult["status"];
  message?: string;
}

/**
 * Abstraction for all user-facing I/O operations.
 *
 * Implemented by CliIOProvider (terminal prompts) and
 * ElectronIOProvider (desktop UI modals). All adapters and the
 * execution orchestrator interact with the user exclusively
 * through this interface.
 */
export interface IOProvider {
  promptUser(message: string, options?: { broker?: string }): Promise<string>;
  waitForConfirmation(message: string, options?: { broker?: string; url?: string }): Promise<void>;
  log(level: "info" | "warn" | "error" | "success", message: string): void;
  openExternal(url: string): Promise<void>;
  shouldOpenInBrowser(broker: BrokerEntry): boolean;
  /**
   * Optional: receives structured per-broker progress. The desktop app
   * forwards it to its progress display; the CLI leaves it out because the
   * orchestrator's log lines already show progress in the terminal.
   */
  reportProgress?(progress: RunProgress): void;
  /**
   * Optional: show a broker's candidate listings and return the ids of the
   * ones the person says are theirs. Nothing selected is the default. Without
   * it, `chooseListings` (utils/chooseListings.ts) asks through `promptUser`
   * with a numbered list.
   */
  selectListings?(request: { broker: string; listings: Listing[] }): Promise<string[]>;
}

/**
 * Passed to adapters and the orchestrator so they can reach the
 * active IOProvider without tight coupling.
 */
export interface ExecutionContext {
  ioProvider: IOProvider;
}
/**
 * What the tool knows about the person's listing at one broker (design plan
 * section 5.1). One state per broker, the worst case across its listings.
 * "removed" means "not found when we looked on that date", never "deleted".
 */
export type BrokerState = "unknown" | "not-found" | "listed" | "requested" | "removed" | "relisted";

/** State of one confirmed listing. "relisted" is a broker-level state only. */
export type ListingState = "listed" | "requested" | "removed";

/** A step of a removal request that still waits on the person. */
export type PendingStep = "email-link" | "phone-call";

/** One confirmed listing as kept in the state file. No summary text is stored. */
export interface ListingRecord {
  /** Stable for the broker: the listing URL without query string. */
  id: string;
  url: string;
  state: ListingState;
  /** Requests made for this listing, so a broker that ignores two is visible. */
  requestAttempts: number;
  pending: PendingStep | null;
}

/** One line of a broker's capped history in the state file. */
export interface StateHistoryEntry {
  at: string;
  event: "scan" | "request" | "verify";
  /** The broker's state after the event. */
  result: BrokerState;
  /** Path of a screenshot, relative to the data directory. */
  evidence?: string;
  /** Set when the person, not the tool, supplied the answer (guided scan). */
  source?: "person";
}

/** Everything the state file keeps for one broker. Dates are ISO 8601 strings. */
export interface BrokerRecord {
  state: BrokerState;
  lastScannedAt: string | null;
  lastRequestedAt: string | null;
  verifyAfter: string | null;
  lastVerifiedAt: string | null;
  nextCheckDue: string | null;
  timesRelisted: number;
  listings: ListingRecord[];
  history: StateHistoryEntry[];
}

/** The contents of data/state.json. Mirrors StateFileSchema in config/schemas.ts. */
export interface StateFile {
  version: 1;
  /** Short hash of the normalised name, ZIP and email the entries were written for. */
  person: string;
  guidanceShownAt: string | null;
  brokers: Record<string, BrokerRecord>;
}
