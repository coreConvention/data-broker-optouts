import type { Page } from "@playwright/test";
import type { BrokerState, IOProvider, PersonProfile } from "../types.js";
import { pickProfileFields } from "../adapters/ListingAdapter.js";
import type { ListingAdapter, ScanResult, VerifyResult } from "../adapters/ListingAdapter.js";
import type { StateStore } from "./StateStore.js";

export type VerifyPassResult =
  /** No request is outstanding, or its window has not passed. Nothing was loaded. */
  | { kind: "not-due" }
  | { kind: "verified"; state: BrokerState };

/**
 * The verify pass for one broker (design plan section 5.2). It submits
 * nothing.
 *
 * For each listing with a request outstanding whose window has passed, it
 * asks the adapter to load the listing address. When an address is gone it
 * repeats the scan once, because a listing can move to a new address: a
 * listing counts as removed only when its address is gone and it is not in
 * the results. Anything that cannot be told is "unknown".
 *
 * A listing that came back under a different address is not recognised here;
 * the next scan shows it to the person, who decides whether it is theirs.
 *
 * The `--verify` command and the desktop button that call this for every
 * broker are #40.
 */
export async function verifyBroker(args: {
  adapter: ListingAdapter;
  store: StateStore;
  page: Page;
  profile: PersonProfile;
  ioProvider: IOProvider;
  now: Date;
}): Promise<VerifyPassResult> {
  const { adapter, store, page, profile, ioProvider, now } = args;
  const record = store.getBroker(adapter.brokerId);
  const outstanding = record.listings.filter((listing) => listing.state === "requested");

  if (outstanding.length === 0 || !record.verifyAfter || now.getTime() < Date.parse(record.verifyAfter)) {
    return { kind: "not-due" };
  }

  const ctx = { ioProvider };
  const results = new Map<string, VerifyResult>();
  for (const listing of outstanding) {
    try {
      results.set(listing.id, await adapter.verifyRemoval(page, { id: listing.id, url: listing.url, summary: "" }, ctx));
    } catch (error) {
      results.set(listing.id, { kind: "unknown", reason: error instanceof Error ? error.message : "the check failed" });
    }
  }

  let rescan: ScanResult | null = null;
  if ([...results.values()].some((result) => result.kind === "removed")) {
    try {
      rescan = await adapter.findListings(page, pickProfileFields(profile, adapter.fields.scan), ctx);
    } catch (error) {
      rescan = { kind: "unknown", reason: error instanceof Error ? error.message : "the scan failed" };
    }
  }

  for (const listing of outstanding) {
    let kind = results.get(listing.id)!.kind;
    if (kind === "removed" && rescan) {
      if (rescan.kind === "unknown") {
        kind = "unknown";
      } else if (rescan.kind === "found" && rescan.listings.some((found) => found.id === listing.id)) {
        kind = "listed";
      }
    }
    store.recordVerify(adapter.brokerId, listing.id, { kind });
  }
  await store.save();

  return { kind: "verified", state: store.getBroker(adapter.brokerId).state };
}
