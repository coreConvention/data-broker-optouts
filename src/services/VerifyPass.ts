import type { Page } from "@playwright/test";
import type { BrokerRecord, BrokerState, IOProvider, PersonProfile } from "../types.js";
import { pickProfileFields } from "../adapters/ListingAdapter.js";
import type { ListingAdapter, ScanResult, VerifyResult } from "../adapters/ListingAdapter.js";
import type { StateStore } from "./StateStore.js";
import type { EvidenceStore } from "./EvidenceStore.js";
import { describeFailure } from "../utils/describeFailure.js";

export type VerifyPassResult =
  /** No request is outstanding, or its window has not passed. Nothing was loaded. */
  | { kind: "not-due" }
  | {
      kind: "verified";
      /** The broker's state after the pass. */
      state: BrokerState;
      /** Listings whose address was gone and that a repeat scan did not show. */
      removed: number;
      /** Listings that are still published. */
      listed: number;
      /** Listings the pass could not tell about; their requests stay outstanding. */
      unknown: number;
      /** The most removal requests made for any listing that is still published. */
      attempts: number;
    };

/**
 * Whether a broker has a request the verify pass can check yet.
 *
 * - "none": no request is outstanding. A request still waiting on the person
 *   (email link, phone call) is not outstanding: its listing is "listed".
 * - "waiting": a request is outstanding and the broker's window has not passed.
 * - "due": a request is outstanding and the window has passed.
 */
export function verifyStatus(record: BrokerRecord, now: Date): "none" | "waiting" | "due" {
  if (!record.listings.some((listing) => listing.state === "requested")) {
    return "none";
  }
  return record.verifyAfter && now.getTime() >= Date.parse(record.verifyAfter) ? "due" : "waiting";
}

/**
 * The verify pass for one broker (design plan section 5.2). It submits
 * nothing.
 *
 * For each listing with a request outstanding whose window has passed, it
 * asks the adapter to load the listing address. When an address is gone it
 * repeats the scan once, because a listing can move to a new address: a
 * listing counts as removed only when its address is gone and it is not in
 * the results. Anything that cannot be told is "unknown", and its request
 * stays outstanding so the next pass looks again.
 *
 * A listing that came back under a different address is not recognised here;
 * the next scan shows it to the person, who decides whether it is theirs.
 *
 * A screenshot of each listing page as the check found it goes to the
 * evidence folder, and its path into the state file's history.
 *
 * `ExecutionOrchestrator.verifyAll` calls this for every broker that is due
 * (`--verify` on the CLI).
 */
export async function verifyBroker(args: {
  adapter: ListingAdapter;
  store: StateStore;
  page: Page;
  profile: PersonProfile;
  ioProvider: IOProvider;
  now: Date;
  evidence?: EvidenceStore;
}): Promise<VerifyPassResult> {
  const { adapter, store, page, profile, ioProvider, now, evidence } = args;
  const record = store.getBroker(adapter.brokerId);

  if (verifyStatus(record, now) !== "due") {
    return { kind: "not-due" };
  }
  const outstanding = record.listings.filter((listing) => listing.state === "requested");

  const ctx = { ioProvider, ...(evidence ? { evidence } : {}) };
  const results = new Map<string, VerifyResult>();
  const screenshots = new Map<string, string>();
  for (const listing of outstanding) {
    try {
      results.set(listing.id, await adapter.verifyRemoval(page, { id: listing.id, url: listing.url, summary: "" }, ctx));
    } catch (error) {
      // Only the kind of error is kept: its text can quote the listing address.
      results.set(listing.id, { kind: "unknown", reason: describeFailure("the check", error) });
      continue;
    }
    if (evidence) {
      const saved = await evidence.capture(page, adapter.brokerId, "verify");
      if (saved) {
        screenshots.set(listing.id, saved);
      } else {
        ioProvider.log("warn", "A screenshot of the check could not be saved.");
      }
    }
  }

  let rescan: ScanResult | null = null;
  if ([...results.values()].some((result) => result.kind === "removed")) {
    try {
      rescan = await adapter.findListings(page, pickProfileFields(profile, adapter.fields.scan), ctx);
    } catch (error) {
      rescan = { kind: "unknown", reason: describeFailure("the scan", error) };
    }
  }

  const counts = { removed: 0, listed: 0, unknown: 0 };
  let attempts = 0;
  for (const listing of outstanding) {
    let kind = results.get(listing.id)!.kind;
    if (kind === "removed" && rescan) {
      if (rescan.kind === "unknown") {
        kind = "unknown";
      } else if (rescan.kind === "found" && rescan.listings.some((found) => found.id === listing.id)) {
        kind = "listed";
      }
    }
    counts[kind]++;
    if (kind === "listed") {
      attempts = Math.max(attempts, listing.requestAttempts);
    }
    const screenshot = screenshots.get(listing.id);
    store.recordVerify(adapter.brokerId, listing.id, { kind }, screenshot ? { evidence: screenshot } : {});
  }
  await store.save();

  return { kind: "verified", state: store.getBroker(adapter.brokerId).state, ...counts, attempts };
}
