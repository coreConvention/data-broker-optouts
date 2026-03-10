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

export type HumanInteractionMode = "modal" | "browser";

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
}

/**
 * Passed to adapters and the orchestrator so they can reach the
 * active IOProvider without tight coupling.
 */
export interface ExecutionContext {
  ioProvider: IOProvider;
}