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
      /**
       * Listings the repeat scan showed that the person has never been asked
       * about. Any of them could be a listing that moved.
       */
      others: number;
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
 * A listing that came back under a different address cannot be recognised
 * here: only the person can say whether a listing is theirs. When the repeat
 * scan shows a listing they have never been asked about, the broker is left
 * "unknown" instead of "removed", so the next run shows it to them.
 *
 * A screenshot of each listing page as the check left it goes to the
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
    }
    // Whatever the check made of it, the page it was looking at is kept.
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

  const outcomes = outstanding.map((listing) => {
    let kind = results.get(listing.id)!.kind;
    if (kind === "removed" && rescan) {
      if (rescan.kind === "unknown") {
        kind = "unknown";
      } else if (rescan.kind === "found" && rescan.listings.some((found) => found.id === listing.id)) {
        kind = "listed";
      }
    }
    return { listing, kind };
  });

  // Outcomes that could not tell are written last. The store works a
  // broker's state out again on every conclusive outcome, so an "unknown"
  // written first would be lost, and the state would depend on the order the
  // listings happened to be checked in (issue #68).
  const counts = { removed: 0, listed: 0, unknown: 0 };
  let attempts = 0;
  for (const { listing, kind } of [
    ...outcomes.filter((outcome) => outcome.kind !== "unknown"),
    ...outcomes.filter((outcome) => outcome.kind === "unknown")
  ]) {
    counts[kind]++;
    if (kind === "listed") {
      attempts = Math.max(attempts, listing.requestAttempts);
    }
    const screenshot = screenshots.get(listing.id);
    store.recordVerify(adapter.brokerId, listing.id, { kind }, screenshot ? { evidence: screenshot } : {});
  }

  // A listing can move to a new address, and the tool cannot know whether a
  // listing it has never shown the person is theirs. So when the repeat scan
  // shows one, the broker is not "removed": the scan is recorded as one that
  // could not tell, which makes the broker due straight away, and the next
  // run shows those listings to the person (issue #68).
  const recorded = new Set(record.listings.map((listing) => listing.id));
  const others =
    rescan?.kind === "found" ? rescan.listings.filter((found) => !recorded.has(found.id)).length : 0;
  if (others > 0 && store.getBroker(adapter.brokerId).state === "removed") {
    store.recordScan(adapter.brokerId, { kind: "unknown" });
  }
  await store.save();

  return { kind: "verified", state: store.getBroker(adapter.brokerId).state, ...counts, attempts, others };
}
