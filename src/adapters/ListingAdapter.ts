import type { Page } from "@playwright/test";
import type { ExecutionContext, PendingStep, PersonProfile } from "../types.js";

/**
 * The scan-first adapter contract (design plan section 4.1).
 *
 * An adapter that implements it is driven through scan, confirm, request by
 * ExecutionOrchestrator. Adapters that only extend BaseAdapter keep their
 * `run()` path. Rules that go with the contract:
 *
 * - `findListings` and `verifyRemoval` only read. They never fill a form on
 *   the broker's opt-out page.
 * - `findListings` returns "not-found" only when it positively recognises an
 *   empty results page. Any doubt is "unknown".
 * - `requestRemoval` is called once per listing the person confirmed.
 * - Each step receives only the profile fields the adapter declared for it.
 * - An adapter takes its base URL from a constructor option so tests can
 *   point it at local fixtures.
 */

/** One candidate record on a broker's site. */
export interface Listing {
  /** Stable for this broker: the listing URL without query string. */
  id: string;
  url: string;
  /** What the broker shows, so the person can tell records apart: name, age, places. */
  summary: string;
}

export type ScanResult =
  | { kind: "found"; listings: Listing[] }
  /** The results page loaded and was empty, or the person answered "none" in a guided scan. */
  | { kind: "not-found"; source?: "person" }
  /** Blocked, errored or unreadable. Never treated as "not-found". */
  | { kind: "unknown"; reason: string };

export type RemovalResult =
  /** `evidence`: path of the confirmation screenshot, relative to the data directory. */
  | { kind: "requested"; pending?: PendingStep; evidence?: string }
  | { kind: "not-completed"; reason: string };

export type VerifyResult =
  | { kind: "removed" }
  | { kind: "listed" }
  | { kind: "unknown"; reason: string };

export interface ListingAdapter {
  /** Stable key used in the state file, e.g. "whitepages". */
  readonly brokerId: string;
  /** Days to wait after a request before verifying. */
  readonly removalWindowDays: number;
  /** Profile fields each step may receive. Nothing else is passed in. */
  readonly fields: { scan: (keyof PersonProfile)[]; request: (keyof PersonProfile)[] };

  findListings(page: Page, person: Partial<PersonProfile>, ctx: ExecutionContext): Promise<ScanResult>;
  requestRemoval(
    page: Page,
    listing: Listing,
    person: Partial<PersonProfile>,
    ctx: ExecutionContext
  ): Promise<RemovalResult>;
  verifyRemoval(page: Page, listing: Listing, ctx: ExecutionContext): Promise<VerifyResult>;
}

/**
 * The profile reduced to the fields a step declared, so an adapter cannot
 * send a field it did not ask for.
 */
export function pickProfileFields(
  profile: PersonProfile,
  fields: (keyof PersonProfile)[]
): Partial<PersonProfile> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    const value = profile[field];
    if (value !== undefined && value !== null) {
      picked[field] = value;
    }
  }
  return picked as Partial<PersonProfile>;
}
