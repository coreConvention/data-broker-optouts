import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  BrokerRecord,
  BrokerState,
  ListingRecord,
  PendingStep,
  PersonProfile,
  StateFile,
  StateHistoryEntry
} from "../types.js";
import { StateFileSchema } from "../config/schemas.js";

/** History lines kept per broker; older ones are dropped (plan section 6.1). */
export const HISTORY_CAP = 20;
/** Days between re-checks unless the person sets another value. */
export const DEFAULT_RECHECK_DAYS = 90;
export const MAX_RECHECK_DAYS = 120;
/** A broker's removal window is never treated as shorter than this (plan section 5.2). */
export const MIN_REMOVAL_WINDOW_DAYS = 3;

/** What a scan told the store. Only listings the person confirmed are passed in. */
export type ScanOutcome =
  | { kind: "found"; listings: { id: string; url: string }[] }
  | { kind: "not-found"; source?: "person" }
  | { kind: "unknown" };

/** What a removal request for one listing told the store. */
export type RequestOutcome =
  | { kind: "requested"; pending?: PendingStep }
  | { kind: "not-completed" };

/** What a verify pass for one listing told the store. */
export type VerifyOutcome = { kind: "removed" } | { kind: "listed" } | { kind: "unknown" };

/** Thrown when the state file exists but cannot be trusted. The file is left untouched. */
export class StateFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateFileError";
  }
}

/** The record of a broker the tool has never looked at. */
export function emptyBrokerRecord(): BrokerRecord {
  return {
    state: "unknown",
    lastScannedAt: null,
    lastRequestedAt: null,
    verifyAfter: null,
    lastVerifiedAt: null,
    nextCheckDue: null,
    timesRelisted: 0,
    listings: [],
    history: []
  };
}

/**
 * Short hash of the normalised name, ZIP and email. It lets the store notice
 * that the profile now describes someone else without writing who that is
 * into the state file.
 */
export function personHash(profile: Pick<PersonProfile, "fullName" | "zip" | "email">): string {
  const name = profile.fullName.trim().toLowerCase().replace(/\s+/g, " ");
  const zip = (profile.zip ?? "").replace(/\D/g, "").slice(0, 5);
  const email = profile.email.trim().toLowerCase();
  return createHash("sha256").update(`${name}|${zip}|${email}`).digest("hex").slice(0, 12);
}

function addDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The broker's state is the worst case across its listings. */
function deriveState(listings: ListingRecord[], relisted: boolean): BrokerState {
  if (listings.some((l) => l.state === "listed")) return relisted ? "relisted" : "listed";
  if (listings.some((l) => l.state === "requested")) return "requested";
  return listings.length > 0 ? "removed" : "not-found";
}

function withHistory(
  record: BrokerRecord,
  entry: Omit<StateHistoryEntry, "result">
): BrokerRecord {
  const history = [...record.history, { ...entry, result: record.state }].slice(-HISTORY_CAP);
  return { ...record, history };
}

function historyExtras(options: { evidence?: string; source?: "person" }): Partial<StateHistoryEntry> {
  return {
    ...(options.evidence ? { evidence: options.evidence } : {}),
    ...(options.source ? { source: options.source } : {})
  };
}

/**
 * State after a scan. Pure: returns a new record.
 *
 * - unknown: the state becomes "unknown"; listings are kept, because a look
 *   that could not tell says nothing about them.
 * - not-found: unrequested listings are dropped. A listing with a request
 *   outstanding stays "requested" (only a verify ends a request) and one that
 *   was verified gone stays "removed".
 * - found: confirmed listings are merged in. A listing found at a broker
 *   whose listings had all been removed makes the broker "relisted" and is
 *   counted once per relisting.
 */
export function applyScan(
  prev: BrokerRecord,
  outcome: ScanOutcome,
  now: Date,
  options: { recheckDays?: number; evidence?: string } = {}
): BrokerRecord {
  const at = now.toISOString();
  const extras = historyExtras({
    ...(options.evidence ? { evidence: options.evidence } : {}),
    ...(outcome.kind === "not-found" && outcome.source ? { source: outcome.source } : {})
  });
  const base: BrokerRecord = { ...prev, lastScannedAt: at };

  if (outcome.kind === "unknown") {
    return withHistory({ ...base, state: "unknown" }, { at, event: "scan", ...extras });
  }

  const nextCheckDue = addDays(now, options.recheckDays ?? DEFAULT_RECHECK_DAYS);
  const found = outcome.kind === "found" ? outcome.listings : [];

  if (found.length === 0) {
    const listings = prev.listings.filter((l) => l.state !== "listed");
    return withHistory(
      { ...base, nextCheckDue, listings, state: deriveState(listings, false) },
      { at, event: "scan", ...extras }
    );
  }

  const wasRemoved =
    prev.state === "removed" ||
    (prev.listings.length > 0 && prev.listings.every((l) => l.state === "removed"));
  const foundIds = new Set(found.map((l) => l.id));

  // Listings seen again keep their request history; an unrequested listing
  // that this scan did not confirm is dropped.
  const listings: ListingRecord[] = prev.listings
    .filter((l) => foundIds.has(l.id) || l.state !== "listed")
    .map((l) =>
      foundIds.has(l.id) && l.state === "removed" ? { ...l, state: "listed" as const, pending: null } : l
    );
  for (const listing of found) {
    if (!listings.some((l) => l.id === listing.id)) {
      listings.push({ id: listing.id, url: listing.url, state: "listed", requestAttempts: 0, pending: null });
    }
  }

  const relisted = wasRemoved || prev.state === "relisted";
  return withHistory(
    {
      ...base,
      nextCheckDue,
      listings,
      timesRelisted: prev.timesRelisted + (wasRemoved ? 1 : 0),
      state: deriveState(listings, relisted)
    },
    { at, event: "scan", ...extras }
  );
}

function requireListing(record: BrokerRecord, listingId: string): ListingRecord {
  const listing = record.listings.find((l) => l.id === listingId);
  if (!listing) {
    throw new Error("No confirmed listing with that id is recorded for this broker; scan first.");
  }
  return listing;
}

function replaceListing(record: BrokerRecord, next: ListingRecord): ListingRecord[] {
  return record.listings.map((l) => (l.id === next.id ? next : l));
}

/**
 * State after a removal request for one listing. Pure.
 *
 * A request still waiting on the person (unclicked email link, unanswered
 * call) leaves the listing "listed" with `pending` set, so it is not mistaken
 * for progress. A request that was not completed changes nothing but history.
 */
export function applyRequest(
  prev: BrokerRecord,
  listingId: string,
  outcome: RequestOutcome,
  now: Date,
  options: { removalWindowDays: number; evidence?: string }
): BrokerRecord {
  const at = now.toISOString();
  const listing = requireListing(prev, listingId);
  const extras = historyExtras(options);
  const relisted = prev.state === "relisted";

  if (outcome.kind === "not-completed") {
    return withHistory(prev, { at, event: "request", ...extras });
  }

  if (outcome.pending) {
    const listings = replaceListing(prev, {
      ...listing,
      state: "listed",
      pending: outcome.pending,
      requestAttempts: listing.requestAttempts + 1
    });
    return withHistory(
      { ...prev, listings, state: deriveState(listings, relisted) },
      { at, event: "request", ...extras }
    );
  }

  const listings = replaceListing(prev, {
    ...listing,
    state: "requested",
    pending: null,
    requestAttempts: listing.requestAttempts + 1
  });
  return withHistory(
    {
      ...prev,
      listings,
      lastRequestedAt: at,
      verifyAfter: addDays(now, Math.max(MIN_REMOVAL_WINDOW_DAYS, options.removalWindowDays)),
      state: deriveState(listings, relisted)
    },
    { at, event: "request", ...extras }
  );
}

/** State after a verify pass for one listing. Pure. */
export function applyVerify(
  prev: BrokerRecord,
  listingId: string,
  outcome: VerifyOutcome,
  now: Date,
  options: { recheckDays?: number; evidence?: string } = {}
): BrokerRecord {
  const at = now.toISOString();
  const listing = requireListing(prev, listingId);
  const extras = historyExtras(options);
  const base: BrokerRecord = { ...prev, lastVerifiedAt: at };

  if (outcome.kind === "unknown") {
    return withHistory({ ...base, state: "unknown" }, { at, event: "verify", ...extras });
  }

  const listings = replaceListing(prev, {
    ...listing,
    state: outcome.kind === "removed" ? "removed" : "listed",
    pending: null
  });
  return withHistory(
    {
      ...base,
      listings,
      nextCheckDue: addDays(now, options.recheckDays ?? DEFAULT_RECHECK_DAYS),
      state: deriveState(listings, false)
    },
    { at, event: "verify", ...extras }
  );
}

export interface StateStoreOptions {
  /** Clock, so tests can set "now". */
  now?: () => Date;
  /** Days between re-checks: 90 by default, at most 120. */
  recheckDays?: number;
}

/**
 * Reads and writes the state file: what the tool found, requested and
 * verified at each broker (design plan sections 5.1 and 6.1).
 *
 * Single Responsibility: the persisted broker states. It never calls a
 * broker. The path is the caller's: `data/state.json` for the CLI, the app's
 * data directory for the desktop app.
 *
 * The only way to get a store is `load`, which refuses a file it cannot
 * read. A store therefore never exists for an unreadable file, so nothing
 * can save an empty history over it.
 */
export class StateStore {
  private state: StateFile;
  private readonly now: () => Date;
  private readonly recheckDays: number;

  /** True when the file on disk was written for a different person. */
  public readonly personChanged: boolean;

  private constructor(
    private readonly filePath: string,
    state: StateFile,
    personChanged: boolean,
    options: StateStoreOptions
  ) {
    this.state = state;
    this.personChanged = personChanged;
    this.now = options.now ?? (() => new Date());
    this.recheckDays = Math.min(
      MAX_RECHECK_DAYS,
      Math.max(1, Math.floor(options.recheckDays ?? DEFAULT_RECHECK_DAYS))
    );
  }

  /**
   * Load the state file, or start empty when there is none.
   *
   * Entries written for a different person (the hash on the file differs
   * from the profile's) are not trusted: every broker reads as "unknown",
   * and the next save replaces the file with this person's entries.
   *
   * @throws StateFileError when the file exists but cannot be read or is not
   *   a valid state file. The message never quotes the file's contents.
   */
  public static async load(
    filePath: string,
    profile: Pick<PersonProfile, "fullName" | "zip" | "email">,
    options: StateStoreOptions = {}
  ): Promise<StateStore> {
    const person = personHash(profile);
    const fresh: StateFile = { version: 1, person, guidanceShownAt: null, brokers: {} };

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new StateStore(filePath, fresh, false, options);
      }
      throw StateStore.unreadable(filePath, (error as NodeJS.ErrnoException).code ?? "it could not be opened");
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw StateStore.unreadable(filePath, "it is not valid JSON");
    }

    const parsed = StateFileSchema.safeParse(json);
    if (!parsed.success) {
      // Field paths only: the values are listing addresses with the person's name.
      const where = parsed.error.issues
        .slice(0, 3)
        .map((issue) => issue.path.join(".") || "(top level)")
        .join(", ");
      throw StateStore.unreadable(filePath, `it is not a state file this version understands (at: ${where})`);
    }

    const state = parsed.data as StateFile;
    if (state.person !== person) {
      // Guidance is per person too, so it is shown again.
      return new StateStore(filePath, fresh, true, options);
    }
    return new StateStore(filePath, state, false, options);
  }

  private static unreadable(filePath: string, why: string): StateFileError {
    return new StateFileError(
      `Cannot use the state file at ${filePath}: ${why}. ` +
        "It has been left as it is. Fix it or move it aside, then run again."
    );
  }

  /** The record for a broker; "unknown" with no history when there is none. */
  public getBroker(brokerId: string): BrokerRecord {
    return structuredClone(this.state.brokers[brokerId] ?? emptyBrokerRecord());
  }

  /** Ids of the brokers that have a record. */
  public brokerIds(): string[] {
    return Object.keys(this.state.brokers);
  }

  public get guidanceShownAt(): string | null {
    return this.state.guidanceShownAt;
  }

  public markGuidanceShown(): void {
    this.state.guidanceShownAt = this.now().toISOString();
  }

  public recordScan(brokerId: string, outcome: ScanOutcome, options: { evidence?: string } = {}): BrokerRecord {
    return this.put(
      brokerId,
      applyScan(this.getBroker(brokerId), outcome, this.now(), { ...options, recheckDays: this.recheckDays })
    );
  }

  public recordRequest(
    brokerId: string,
    listingId: string,
    outcome: RequestOutcome,
    options: { removalWindowDays: number; evidence?: string }
  ): BrokerRecord {
    return this.put(brokerId, applyRequest(this.getBroker(brokerId), listingId, outcome, this.now(), options));
  }

  public recordVerify(
    brokerId: string,
    listingId: string,
    outcome: VerifyOutcome,
    options: { evidence?: string } = {}
  ): BrokerRecord {
    return this.put(
      brokerId,
      applyVerify(this.getBroker(brokerId), listingId, outcome, this.now(), {
        ...options,
        recheckDays: this.recheckDays
      })
    );
  }

  private put(brokerId: string, record: BrokerRecord): BrokerRecord {
    this.state.brokers[brokerId] = record;
    return structuredClone(record);
  }

  /**
   * Write the state file atomically: a temporary file in the same folder,
   * then a rename over the real one, so a crash mid-write cannot leave a
   * half-written history behind.
   */
  public async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(this.state, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }
}
