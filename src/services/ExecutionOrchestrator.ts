import type { BrowserContext, Page } from "@playwright/test";
import type { BrokerEntry, PersonProfile, OptOutResult, IOProvider, ExecutionContext } from "../types.js";
import { Logger } from "../utils/logger.js";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { StatisticsTracker } from "./StatisticsTracker.js";
import type { StateStore, RequestOutcome } from "./StateStore.js";
import { EvidenceStore } from "./EvidenceStore.js";
import type { EvidenceEvent } from "./EvidenceStore.js";
import { verifyBroker, verifyStatus } from "./VerifyPass.js";
import { pickProfileFields } from "../adapters/ListingAdapter.js";
import type { ListingAdapter, Listing, RemovalResult, ScanResult } from "../adapters/ListingAdapter.js";
import { chooseListings } from "../utils/chooseListings.js";
import { describeFailure } from "../utils/describeFailure.js";
import { describeFields } from "../utils/dryRunNotice.js";
import { formatDay } from "../utils/formatDay.js";

/**
 * Options for execution orchestrator
 */
export interface ExecutionOptions {
  dryRun: boolean;
  delayBetweenBrokers: number;
}

/**
 * Collaborators the orchestrator needs for brokers that have a listing
 * adapter. Both are optional so brokers without one run exactly as before.
 */
export interface ExecutionDependencies {
  /** Where scan and request outcomes are kept. Required once any broker has a listing adapter. */
  stateStore?: StateStore;
  /** Defaults to AdapterFactory.createListingAdapter; tests pass a fake or a fixture-backed adapter. */
  createListingAdapter?: (entry: BrokerEntry) => ListingAdapter | null;
  /**
   * The evidence folder (`data/evidence`, or the same folder under the desktop
   * app's data directory). Screenshots are taken only when it is given.
   */
  evidenceDir?: string;
  /** Clock for the verify pass and for screenshot file names; tests set it. */
  now?: () => Date;
}

/** A broker in a verify pass: its manifest entry and its listing adapter. */
export interface VerifyTarget {
  entry: BrokerEntry;
  adapter: ListingAdapter;
}

/**
 * Orchestrates the execution of opt-out requests across multiple brokers
 * Single Responsibility: Coordinate the opt-out process flow
 *
 * Follows Facade Pattern to simplify complex subsystem interactions
 */
export class ExecutionOrchestrator {
  private logger: Logger;
  private statistics: StatisticsTracker;
  private options: ExecutionOptions;
  private ioProvider: IOProvider;
  private shouldStop = false;
  private isPaused = false;
  private stateStore: StateStore | undefined;
  private createListingAdapter: (entry: BrokerEntry) => ListingAdapter | null;
  private evidence: EvidenceStore | undefined;
  private now: () => Date;

  constructor(
    logger: Logger,
    options: ExecutionOptions,
    ioProvider: IOProvider,
    dependencies: ExecutionDependencies = {}
  ) {
    this.logger = logger;
    this.statistics = new StatisticsTracker();
    this.options = options;
    this.ioProvider = ioProvider;
    this.stateStore = dependencies.stateStore;
    this.createListingAdapter =
      dependencies.createListingAdapter ?? ((entry) => AdapterFactory.createListingAdapter(entry));
    this.now = dependencies.now ?? (() => new Date());
    this.evidence = dependencies.evidenceDir ? new EvidenceStore(dependencies.evidenceDir, this.now) : undefined;
  }

  /**
   * Request the orchestrator to stop processing after the current broker
   */
  public requestStop(): void {
    this.shouldStop = true;
  }

  /**
   * Request the orchestrator to pause between brokers
   */
  public requestPause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing after a pause
   */
  public requestResume(): void {
    this.isPaused = false;
  }

  /**
   * Check if paused, waiting until resumed or stopped.
   * Returns true if the run should stop.
   */
  private async checkPauseAndStop(): Promise<boolean> {
    while (this.isPaused && !this.shouldStop) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.shouldStop;
  }

  /**
   * Execute opt-out requests for all brokers
   *
   * @param brokers - Array of broker entries to process
   * @param profile - User profile data
   * @param context - Browser context for automation
   */
  public async executeAll(
    brokers: BrokerEntry[],
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<void> {
    const totalBrokers = brokers.length;

    for (let i = 0; i < brokers.length; i++) {
      if (await this.checkPauseAndStop()) {
        this.ioProvider.log("warn", "Run stopped by user.");
        break;
      }

      const entry = brokers[i]!;
      const brokerNum = i + 1;

      this.printBrokerHeader(entry, brokerNum, totalBrokers);
      this.ioProvider.reportProgress?.({
        current: i,
        total: totalBrokers,
        broker: entry.name,
        status: "processing"
      });

      const result = await this.executeBroker(entry, profile, context);
      this.ioProvider.reportProgress?.({
        current: brokerNum,
        total: totalBrokers,
        broker: entry.name,
        status: result.status,
        ...(result.message ? { message: result.message } : {})
      });

      // Add delay between brokers to avoid rate limiting
      if (i < brokers.length - 1) {
        await this.delayBetweenBrokers();
      }
    }

    this.statistics.printReport(totalBrokers);
  }

  /**
   * The verify pass for every broker in the list that has a request
   * outstanding (design plan section 5.2). This is `--verify` on the CLI and
   * the entry point the desktop app calls. It submits nothing.
   *
   * A broker is checked only once its waiting period has passed. One still
   * inside it is named with the day it can be checked; a request waiting on a
   * step only the person can do is named as that, and stays "listed".
   *
   * A dry run names what would be checked, loads nothing and writes nothing.
   *
   * @param brokers - Broker entries to consider; those without a listing adapter are ignored
   * @param profile - User profile data (the repeat scan needs the adapter's scan fields)
   * @param context - Browser context
   */
  public async verifyAll(brokers: BrokerEntry[], profile: PersonProfile, context: BrowserContext): Promise<void> {
    await this.verifyDue(this.verifyTargets(brokers), profile, context);
  }

  /**
   * Run the verify pass for brokers `verifyTargets` returned. Split from
   * `verifyAll` so a caller can look at what is due before opening a browser.
   *
   * @param due - The brokers to check, from `verifyTargets`
   * @param profile - User profile data
   * @param context - Browser context
   */
  public async verifyDue(due: VerifyTarget[], profile: PersonProfile, context: BrowserContext): Promise<void> {
    if (due.length === 0) {
      this.ioProvider.log("info", "No removal request is ready to check.");
      return;
    }

    for (let i = 0; i < due.length; i++) {
      if (await this.checkPauseAndStop()) {
        this.ioProvider.log("warn", "Run stopped by user.");
        break;
      }

      const target = due[i]!;
      this.ioProvider.log("info", `\n[${i + 1}/${due.length}] Checking: ${target.entry.name}`);
      this.ioProvider.reportProgress?.({
        current: i,
        total: due.length,
        broker: target.entry.name,
        status: "processing"
      });

      const result = await this.verifyOne(target, profile, context);
      this.ioProvider.reportProgress?.({
        current: i + 1,
        total: due.length,
        broker: target.entry.name,
        status: result.status,
        ...(result.message ? { message: result.message } : {})
      });

      if (i < due.length - 1) {
        await this.delayBetweenBrokers();
      }
    }

    this.statistics.printReport(due.length);
  }

  /**
   * The brokers whose requests the verify pass can check now. For the others
   * that have a request, it says why they are not checked yet. Loads nothing.
   *
   * @param brokers - Broker entries to consider
   * @returns The brokers that are due, in the order given
   */
  public verifyTargets(brokers: BrokerEntry[]): VerifyTarget[] {
    const store = this.requireStateStore("The verify pass");
    const now = this.now();
    const due: VerifyTarget[] = [];

    for (const entry of brokers) {
      const adapter = this.createListingAdapter(entry);
      if (!adapter) continue;

      const record = store.getBroker(adapter.brokerId);
      const status = verifyStatus(record, now);
      if (status === "due") {
        due.push({ entry, adapter });
      } else if (status === "waiting") {
        const from = record.verifyAfter ? `from ${formatDay(record.verifyAfter)}` : "later";
        this.ioProvider.log("info", `${entry.name}: the removal request can be checked ${from}.`);
      }

      const waitingOnPerson = record.listings.filter((listing) => listing.pending !== null).length;
      if (waitingOnPerson > 0) {
        this.ioProvider.log(
          "warn",
          `${entry.name}: ${waitingOnPerson} request(s) still waiting on a step only you can do ` +
            "(an emailed link or a phone call). There is nothing to check until that is done; " +
            "run the tool without --verify to make the request again."
        );
      }
    }
    return due;
  }

  /** The verify pass for one broker that is due, written to the run log and counted. */
  private async verifyOne(
    target: VerifyTarget,
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<OptOutResult> {
    const { entry, adapter } = target;
    const store = this.requireStateStore("The verify pass");
    const result = this.createBaseResult(entry);
    const before = store.getBroker(adapter.brokerId);
    const outstanding = before.listings.filter((listing) => listing.state === "requested").length;

    if (this.options.dryRun) {
      await this.finishBroker(
        result,
        before.state,
        `[DRY RUN] Would check ${outstanding} listing(s). Nothing was loaded.`,
        "info"
      );
      return result;
    }

    // The check loads the listing address and repeats the search, and both
    // carry the person's name. Say so, with field names only.
    this.ioProvider.log(
      "info",
      `Loading the address of ${outstanding} listing(s) at ${entry.name}, then repeating the search, ` +
        `which sends your ${describeFields(adapter.fields.scan)}. Nothing is submitted.`
    );

    const now = this.now();
    try {
      const page = await context.newPage();
      try {
        const outcome = await verifyBroker({
          adapter,
          store,
          page,
          profile,
          ioProvider: this.ioProvider,
          now,
          ...(this.evidence ? { evidence: this.evidence } : {})
        });
        if (outcome.kind === "not-due") {
          await this.finishBroker(result, before.state, "Nothing was ready to check.", "info");
          return result;
        }

        // "removed" is only ever "not found when checked on <date>": the tool
        // looked and did not see the listing, which is all it can know.
        const day = formatDay(now);
        const parts: string[] = [];
        if (outcome.removed > 0) {
          parts.push(`${outcome.removed} listing(s) not found when checked on ${day}.`);
        }
        if (outcome.listed > 0) {
          parts.push(
            `${outcome.listed} listing(s) still published when checked on ${day}, after ` +
              `${outcome.attempts} removal request(s); run the tool without --verify to ask again.`
          );
        }
        if (outcome.unknown > 0) {
          parts.push(
            `Could not tell for ${outcome.unknown} listing(s) on ${day}; they will be checked again next time.`
          );
        }
        if (outcome.others > 0) {
          // A count only: those listings' addresses and summaries stay out of the output.
          parts.push(
            `The search still shows ${outcome.others} other listing(s) you have not been asked about. ` +
              "A listing can move to a new address, so run the tool without --verify to see whether one is yours."
          );
        }
        await this.finishBroker(result, outcome.state, parts.join(" "), outcome.state === "removed" ? "success" : "warn");
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (error) {
      // Opening the page or saving the state file failed. The error's text is
      // not passed on: it can quote a listing address or a local path.
      await this.finishBroker(result, "failed", `${describeFailure("the check", error)}. Nothing was submitted.`, "error");
    }
    return result;
  }

  /**
   * Execute opt-out for a single broker
   *
   * @param entry - Broker entry configuration
   * @param profile - User profile data
   * @param context - Browser context
   * @returns The broker's result, with its final status and message
   */
  private async executeBroker(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext
  ): Promise<OptOutResult> {
    const result = this.createBaseResult(entry);

    try {
      // Check if broker has online opt-out path
      if (this.shouldSkipBroker(entry)) {
        await this.handleSkippedBroker(entry, result);
        return result;
      }

      // Check if manual-only broker
      if (this.isManualOnly(entry)) {
        await this.handleManualOnlyBroker(entry, result);
        return result;
      }

      // A broker with a listing adapter is scanned first; nothing is sent
      // unless the person confirms a listing. Dry run included: its scan is
      // read-only.
      const listingAdapter = this.createListingAdapter(entry);
      if (listingAdapter) {
        await this.handleListingFlow(entry, listingAdapter, profile, context, result);
        return result;
      }

      // Execute opt-out (dry-run or actual)
      if (this.options.dryRun) {
        await this.handleDryRun(entry, result);
      } else {
        await this.handleActualExecution(entry, profile, context, result);
      }
    } catch (error) {
      await this.handleExecutionError(error, result);
    }

    return result;
  }

  /**
   * Check if broker should be skipped
   */
  private shouldSkipBroker(entry: BrokerEntry): boolean {
    return !entry.removalUrl &&
      !entry.requirements.includes("email") &&
      !entry.requirements.includes("phone");
  }

  /**
   * Check if broker requires manual action only
   */
  private isManualOnly(entry: BrokerEntry): boolean {
    const hasEmail = entry.requirements.includes("email");
    const hasPhone = entry.requirements.includes("phone");
    const hasOnline = entry.requirements.includes("online");

    return (hasEmail && !hasOnline) || (hasPhone && !hasOnline);
  }

  /**
   * Handle skipped broker
   */
  private async handleSkippedBroker(entry: BrokerEntry, result: OptOutResult): Promise<void> {
    result.status = "skipped";
    result.message = "No online/email/phone path defined.";
    await this.recordResult(result);
    this.statistics.recordSkipped();
    this.ioProvider.log("warn", `Skipped: ${result.message}`);
  }

  /**
   * Handle manual-only broker
   */
  private async handleManualOnlyBroker(entry: BrokerEntry, result: OptOutResult): Promise<void> {
    const method = entry.requirements.includes("email") ? "Email" : "Phone";
    result.status = "manual-needed";
    result.message = `${method}-only removal. See notes/website.`;
    await this.recordResult(result);
    this.statistics.recordManualNeeded();
    this.ioProvider.log("warn", `Manual needed: ${result.message}`);
  }

  /**
   * Handle dry-run execution
   */
  private async handleDryRun(entry: BrokerEntry, result: OptOutResult): Promise<void> {
    this.ioProvider.log("info", `[DRY RUN] Would run ${entry.adapter} adapter`);
    this.ioProvider.log("info", `[DRY RUN] Would navigate to: ${entry.removalUrl}`);

    // Mirror the real run: an unverified generic entry is never auto-filled,
    // so a dry run must not report it as a simulated submission.
    if (entry.adapter === "generic" && entry.verified !== true) {
      result.status = "manual-needed";
      result.message = "[DRY RUN] Form automation unverified: would open the page for you to finish by hand";
      await this.recordResult(result);
      this.statistics.recordManualNeeded();
      this.ioProvider.log("warn", result.message);
      this.ioProvider.log("info", "Dry run completed");
      return;
    }

    // Says that the profile would be typed, never what it holds (issue #34)
    this.ioProvider.log("info", "[DRY RUN] Would fill the form from your profile");

    result.status = "success";
    result.message = "[DRY RUN] Simulated successful submission";
    await this.recordResult(result);
    this.statistics.recordSuccess();
    this.ioProvider.log("info", "Dry run completed");
  }

  /**
   * Handle actual execution
   */
  private async handleActualExecution(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext,
    result: OptOutResult
  ): Promise<void> {
    const adapter = AdapterFactory.createAdapter(entry);
    const outcome = await adapter.run(context, profile, this.executionContext());

    // The adapter opened the page but did not submit anything itself
    // (unverified entry, or the page did not look like the opt-out form).
    if (outcome === "manual") {
      result.status = "manual-needed";
      result.message = "Opened for you to finish by hand; nothing was submitted automatically.";
      await this.recordResult(result);
      this.statistics.recordManualNeeded();
      this.ioProvider.log("warn", `${entry.name}: ${result.message}`);
      return;
    }

    result.status = "success";
    result.message = "Submitted (some steps may have been manual).";
    await this.recordResult(result);
    this.statistics.recordSuccess();
    this.ioProvider.log("success", `${entry.name}: ${result.message}`);
  }

  /**
   * Scan, confirm, request for a broker that has a listing adapter
   * (design plan section 4.3).
   *
   * - A scan that cannot tell records "unknown" and stops; it is never
   *   treated as "not-found".
   * - "not-found", or candidates the person did not choose, sends nothing.
   * - One request per chosen listing; a request that fails or is not
   *   completed leaves that listing "listed".
   * - A dry run scans and asks, then reports what it would request. It
   *   writes nothing to the state file.
   *
   * Messages carry counts only: listing addresses and summaries hold the
   * person's name and stay out of the run log.
   */
  private async handleListingFlow(
    entry: BrokerEntry,
    adapter: ListingAdapter,
    profile: PersonProfile,
    context: BrowserContext,
    result: OptOutResult
  ): Promise<void> {
    const store = this.requireStateStore(entry.name);
    const dryRun = this.options.dryRun;
    const tag = dryRun ? "[DRY RUN] " : "";
    const execContext = this.executionContext();
    const page = await context.newPage();

    try {
      if (dryRun) {
        // A dry run still searches the broker, and the search carries the
        // person's name. Say so, with field names only, where the desktop
        // app's log view shows it too (issue #63).
        this.ioProvider.log(
          "info",
          `[DRY RUN] Searching ${entry.name} for your listing. The search sends your ` +
            `${describeFields(adapter.fields.scan)}. No removal request will be sent.`
        );
      }

      let scan: ScanResult;
      try {
        scan = await adapter.findListings(page, pickProfileFields(profile, adapter.fields.scan), execContext);
      } catch (error) {
        // An errored look tells us nothing about whether the person is listed.
        // The error's text is not passed on: it can quote the search address.
        scan = { kind: "unknown", reason: describeFailure("the scan", error) };
      }

      if (scan.kind === "unknown") {
        if (!dryRun) {
          store.recordScan(adapter.brokerId, { kind: "unknown" });
          await store.save();
        }
        await this.finishBroker(
          result,
          "unknown",
          `${tag}Could not tell whether you are listed (${scan.reason}). Nothing was sent.`,
          "warn"
        );
        return;
      }

      if (scan.kind === "not-found" || scan.listings.length === 0) {
        if (!dryRun) {
          const source = scan.kind === "not-found" ? scan.source : undefined;
          store.recordScan(adapter.brokerId, { kind: "not-found", ...(source ? { source } : {}) });
          await store.save();
        }
        await this.finishBroker(result, "not-found", `${tag}No listing found when we looked. Nothing was sent.`, "info");
        return;
      }

      const chosen = await chooseListings(this.ioProvider, { broker: entry.name, listings: scan.listings });
      if (chosen.length === 0) {
        if (!dryRun) {
          store.recordScan(adapter.brokerId, { kind: "not-found", source: "person" });
          await store.save();
        }
        await this.finishBroker(
          result,
          "not-found",
          `${tag}${scan.listings.length} listing(s) shown, none chosen as yours. Nothing was sent.`,
          "info"
        );
        return;
      }

      if (dryRun) {
        await this.finishBroker(
          result,
          "listed",
          `[DRY RUN] Would request removal of ${chosen.length} listing(s). Nothing was sent.`,
          "info"
        );
        return;
      }

      // The page still shows what the scan found: the confirmed listing as found.
      const scanEvidence = await this.captureEvidence(page, adapter.brokerId, "scan");
      let record = store.recordScan(
        adapter.brokerId,
        { kind: "found", listings: chosen.map(({ id, url }) => ({ id, url })) },
        scanEvidence ? { evidence: scanEvidence } : {}
      );
      await store.save();

      const requestFields = pickProfileFields(profile, adapter.fields.request);
      let requested = 0;
      let waiting = 0;
      let notCompleted = 0;
      let alreadyRequested = 0;

      for (const listing of chosen) {
        // A request already made and still inside its window is not repeated.
        if (record.listings.find((l) => l.id === listing.id)?.state === "requested") {
          alreadyRequested++;
          continue;
        }

        const removal = await this.requestRemovalSafely(adapter, page, listing, requestFields, execContext);
        const outcome: RequestOutcome =
          removal.kind === "requested"
            ? { kind: "requested", ...(removal.pending ? { pending: removal.pending } : {}) }
            : { kind: "not-completed" };
        // A finished request leaves the broker's confirmation in the window.
        const confirmation =
          removal.kind === "requested" && !removal.pending
            ? await this.captureEvidence(page, adapter.brokerId, "request")
            : null;
        record = store.recordRequest(adapter.brokerId, listing.id, outcome, {
          removalWindowDays: adapter.removalWindowDays,
          ...(confirmation ? { evidence: confirmation } : {})
        });
        // Saved after every request: a crash must not forget one that was sent.
        await store.save();

        if (removal.kind === "not-completed") {
          notCompleted++;
          this.ioProvider.log("warn", `${entry.name}: a removal request was not completed (${removal.reason}).`);
        } else if (removal.pending) {
          waiting++;
        } else {
          requested++;
        }
      }

      const parts: string[] = [];
      if (requested > 0) parts.push(`${requested} removal request(s) made`);
      if (alreadyRequested > 0) parts.push(`${alreadyRequested} already requested`);
      if (waiting > 0) parts.push(`${waiting} waiting on a step only you can do`);
      if (notCompleted > 0) parts.push(`${notCompleted} not completed`);
      await this.finishBroker(
        result,
        record.state,
        `${parts.join(", ")} for ${chosen.length} listing(s).`,
        record.state === "requested" ? "success" : "warn"
      );
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * A request that throws is a request that was not completed, not a crashed
   * broker. The error's text is not passed on: it can quote the listing
   * address the adapter was typing.
   */
  private async requestRemovalSafely(
    adapter: ListingAdapter,
    page: Page,
    listing: Listing,
    person: Partial<PersonProfile>,
    execContext: ExecutionContext
  ): Promise<RemovalResult> {
    try {
      return await adapter.requestRemoval(page, listing, person, execContext);
    } catch (error) {
      return { kind: "not-completed", reason: describeFailure("the request", error) };
    }
  }

  /** What adapters are handed: the way to reach the person, and where screenshots go. */
  private executionContext(): ExecutionContext {
    return { ioProvider: this.ioProvider, ...(this.evidence ? { evidence: this.evidence } : {}) };
  }

  private requireStateStore(what: string): StateStore {
    if (!this.stateStore) {
      throw new Error(`${what} needs the state file, but no state store was given to the run.`);
    }
    return this.stateStore;
  }

  /** Save a screenshot through the evidence store, if the run has one. */
  private async captureEvidence(page: Page, broker: string, event: EvidenceEvent): Promise<string | null> {
    if (!this.evidence) {
      return null;
    }
    const saved = await this.evidence.capture(page, broker, event);
    if (!saved) {
      this.ioProvider.log("warn", "A screenshot could not be saved.");
    }
    return saved;
  }

  /** Set a listing-flow broker's outcome, write it to the run log and count it. */
  private async finishBroker(
    result: OptOutResult,
    status: OptOutResult["status"],
    message: string,
    level: "info" | "warn" | "success" | "error"
  ): Promise<void> {
    result.status = status;
    result.message = message;
    await this.recordResult(result);
    this.statistics.record(status);
    this.ioProvider.log(level, `${result.site}: ${message}`);
  }

  /**
   * Handle execution error
   */
  private async handleExecutionError(error: unknown, result: OptOutResult): Promise<void> {
    result.status = "failed";
    result.message = error instanceof Error ? error.message : "Unknown error";
    await this.recordResult(result);
    this.statistics.recordFailure();
    this.ioProvider.log("error", `Failed: ${result.message}`);
  }

  /**
   * Write a broker's result line to the run log.
   *
   * Never throws: the log is a record of what happened, not part of the
   * opt-out itself. A write failure (folder missing, read-only, disk full)
   * is reported to the user, but it must not turn a submitted opt-out into
   * a "failed" one, and it must not abort the remaining brokers.
   */
  private async recordResult(result: OptOutResult): Promise<void> {
    try {
      await this.logger.append(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.ioProvider.log("error", `Could not write result log for ${result.site}: ${reason}`);
    }
  }

  /**
   * Create base result object for a broker
   */
  private createBaseResult(entry: BrokerEntry): OptOutResult {
    return {
      site: entry.name,
      status: "failed",
      ts: new Date().toISOString(),
      ...(entry.removalUrl ? { url: entry.removalUrl } : {})
    };
  }

  /**
   * Print broker processing header
   */
  private printBrokerHeader(entry: BrokerEntry, brokerNum: number, total: number): void {
    this.ioProvider.log("info", `\n[${brokerNum}/${total}] Processing: ${entry.name}`);
    this.ioProvider.log("info", `    URL: ${entry.removalUrl || "N/A"}`);
    this.ioProvider.log("info", `    Adapter: ${entry.adapter}`);
    this.ioProvider.log("info", `    Requirements: ${entry.requirements.join(", ")}`);
  }

  /**
   * Add delay between brokers
   */
  private async delayBetweenBrokers(): Promise<void> {
    this.ioProvider.log("info", `Waiting ${this.options.delayBetweenBrokers / 1000} seconds before next site...`);
    await new Promise(resolve => setTimeout(resolve, this.options.delayBetweenBrokers));
  }

  /**
   * Get execution statistics
   */
  public getStatistics(): StatisticsTracker {
    return this.statistics;
  }
}
