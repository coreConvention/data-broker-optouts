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

export interface BrokerEntry {
  name: string;
  removalUrl?: string | null;
  requirements: BrokerRequirement[];
  adapter: "generic" | "Spokeo" | "Whitepages" | "Nuwber" | "Radaris" | "BeenVerified" | "Intelius" | "MyLife";
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
  status: "success" | "manual-needed" | "skipped" | "failed";
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
}

/**
 * Passed to adapters and the orchestrator so they can reach the
 * active IOProvider without tight coupling.
 */
export interface ExecutionContext {
  ioProvider: IOProvider;
}