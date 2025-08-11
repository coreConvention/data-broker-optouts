export type BrokerRequirement =
  | "online"
  | "email"
  | "phone"
  | "captcha"
  | "email-verification"
  | "id-upload"
  | "unknown";

export interface BrokerEntry {
  name: string;
  removalUrl?: string | null;
  requirements: BrokerRequirement[];
  adapter: "generic" | "Spokeo" | "Whitepages";
  notes?: string | null;
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

export interface RunOptions {
  manifestPath: string;
  profilePath: string;
  headful: boolean;
}

export interface OptOutResult {
  site: string;
  status: "success" | "manual-needed" | "skipped" | "failed";
  message?: string;
  url?: string;
  ts: string;
}