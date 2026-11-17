import type { Locator, Page, Response } from "@playwright/test";
import type { ExecutionContext, PersonProfile } from "../../types.js";
import type { Listing, ListingAdapter, RemovalResult, ScanResult, VerifyResult } from "../ListingAdapter.js";
import { stateCode } from "../../utils/usStates.js";

const DEFAULT_BASE_URL = "https://www.whitepages.com";

/**
 * UNCONFIRMED AGAINST THE LIVE SITE (#39). Everything in this block is built
 * from the design plan's description of Whitepages, not from captured pages:
 * only the suppression page's first step ("Copy and paste the URL of your
 * profile") was seen first-hand. A person has to walk the live flow once and
 * correct these before the adapter is relied on. Each is written to fail
 * safe: a page that does not match gives "unknown" or "not-completed", never
 * "not-found" and never a typed value in the wrong box.
 */
const SITE = {
  /** Name search: /name/First-Last or /name/First-Last/ST. */
  searchPath: (nameSlug: string, state: string | null): string =>
    state ? `/name/${nameSlug}/${state}` : `/name/${nameSlug}`,
  /** A person's profile address: /name/First-Last/City-ST/<id>. */
  listingPath: /^\/name\/[^/]+\/[^/]+\/[^/]+\/?$/,
  suppressionPath: "/suppression-requests",
  /** Text that positively marks an empty results page. */
  noResults: /\b(no results|0 results|no (records|matches|people) (were )?found|we (could not|couldn't|did not|didn't) find)\b/i,
  /** Text that marks a profile that is no longer published. */
  listingGone: /\b(no longer available|has been removed|page (was )?not found|page cannot be found|record not found)\b/i,
  /** Text a bot check shows before any content. */
  challenge: /\b(verify (that )?you are (a )?human|checking your browser|just a moment|unusual traffic|are you a robot|access denied)\b/i,
  challengeElements: 'iframe[src*="captcha" i], iframe[src*="challenge" i], #challenge-form, [class*="captcha" i]',
  /** Label of the button that submits the profile address. */
  nextButton: /^(next|continue)$/i
};

export interface WhitepagesOptions {
  /** Site root. Tests point this at a local server; the default is the live site. */
  baseUrl?: string;
  navigationTimeoutMs?: number;
}

/**
 * Whitepages (also covers 411.com), end to end through the listing-adapter
 * contract (design plan section 10).
 *
 * - Scan: opens the name search and reads the result cards. A blocked or
 *   unreadable page is "unknown" and turns into a guided scan, where the
 *   person pastes the address of their own profile or answers "none".
 * - Request: opens the suppression page, enters the listing address (the only
 *   value this adapter ever types) and presses Next. The person does the
 *   rest: confirming the record, the reason, their phone number and the
 *   verification call.
 * - Verify: loads the listing address and says whether it is still there.
 *
 * It saves no screenshot itself: each step leaves its page in the window for
 * the flow to capture (see ListingAdapter).
 *
 * The search sends the person's name and state, which is what they would type
 * into the site's own search box. Nothing else from the profile is used.
 */
export class WhitepagesListingAdapter implements ListingAdapter {
  public readonly brokerId = "whitepages";
  public readonly removalWindowDays = 3;
  public readonly fields: ListingAdapter["fields"] = { scan: ["fullName", "state"], request: [] };

  private readonly origin: string;
  private readonly timeout: number;

  constructor(options: WhitepagesOptions = {}) {
    this.origin = new URL(options.baseUrl ?? DEFAULT_BASE_URL).origin;
    this.timeout = options.navigationTimeoutMs ?? 30000;
  }

  public async findListings(
    page: Page,
    person: Partial<PersonProfile>,
    ctx: ExecutionContext
  ): Promise<ScanResult> {
    const name = person.fullName?.trim();
    if (!name) {
      return { kind: "unknown", reason: "the profile has no name to search for" };
    }

    const scan = await this.automaticScan(page, this.searchUrl(name, person.state ?? null));
    if (scan.kind !== "unknown") {
      return scan;
    }
    return this.guidedScan(scan.reason, ctx);
  }

  public async requestRemoval(
    page: Page,
    listing: Listing,
    _person: Partial<PersonProfile>,
    ctx: ExecutionContext
  ): Promise<RemovalResult> {
    const response = await this.open(page, this.origin + SITE.suppressionPath);
    if (!response) {
      return { kind: "not-completed", reason: "the suppression page did not load" };
    }
    // The form page may carry its own CAPTCHA for the person to solve, so
    // only a refusal or a challenge page counts as blocked here.
    const blocked = await this.blockReason(page, response, { checkElements: false });
    if (blocked) {
      return { kind: "not-completed", reason: blocked };
    }

    // Exactly one visible text box, inside a form, or nothing is typed.
    const boxes = page.locator(
      'form input[type="url"]:visible, form input[type="text"]:visible, form input:not([type]):visible'
    );
    if ((await boxes.count()) !== 1) {
      return { kind: "not-completed", reason: "the box for the profile address was not found" };
    }
    const box = boxes.first();
    const next = await this.findNextButton(box);
    if (!next) {
      return { kind: "not-completed", reason: "the Next button was not found" };
    }

    await box.fill(listing.url);
    await next.click();
    await page.waitForLoadState("domcontentloaded", { timeout: this.timeout }).catch(() => undefined);

    const answer = await ctx.ioProvider.promptUser(
      "Whitepages: the address of your listing has been entered.\n" +
        "Finish the request in the browser window: confirm the record, choose a reason, " +
        "enter your phone number and answer the verification call.\n" +
        "When Whitepages shows its confirmation, type: done\n" +
        "If the call never came, type: call\n" +
        "To leave this listing for later, type: skip",
      { broker: "Whitepages" }
    );
    const reply = answer.trim().toLowerCase();

    if (["done", "yes", "y", "finished"].includes(reply)) {
      // The confirmation stays in the window for the flow to screenshot.
      return { kind: "requested" };
    }
    if (["call", "no call", "nocall"].includes(reply)) {
      return { kind: "requested", pending: "phone-call" };
    }
    return { kind: "not-completed", reason: "you did not confirm that the request was finished" };
  }

  public async verifyRemoval(page: Page, listing: Listing, _ctx: ExecutionContext): Promise<VerifyResult> {
    if (!this.listingId(listing.url)) {
      return { kind: "unknown", reason: "the recorded listing address is not a Whitepages address" };
    }
    const response = await this.open(page, listing.url);
    if (!response) {
      return { kind: "unknown", reason: "the listing page did not load" };
    }
    if (response.status() === 404 || response.status() === 410) {
      return { kind: "removed" };
    }
    const blocked = await this.blockReason(page, response);
    if (blocked) {
      return { kind: "unknown", reason: blocked };
    }

    const text = await this.visibleText(page);
    if (SITE.listingGone.test(text)) {
      return { kind: "removed" };
    }
    // Still published: the page loaded at the listing address and shows the name from it.
    const sameAddress = this.listingId(page.url()) === this.listingId(listing.url);
    const nameParts = (new URL(listing.url).pathname.split("/")[2] ?? "").split("-").filter(Boolean);
    const showsName = nameParts.length > 0 && nameParts.every((part) => text.toLowerCase().includes(part.toLowerCase()));
    if (sameAddress && showsName) {
      return { kind: "listed" };
    }
    return { kind: "unknown", reason: "the page was neither a listing nor a removed-listing page" };
  }

  private searchUrl(fullName: string, state: string | null): string {
    const slug = fullName
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}-]/gu, ""))
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("-");
    // A state the tool cannot turn into a two-letter code is left out of the search.
    return this.origin + SITE.searchPath(slug, stateCode(state));
  }

  private async automaticScan(page: Page, url: string): Promise<ScanResult> {
    const response = await this.open(page, url);
    if (!response) {
      return { kind: "unknown", reason: "the search page did not load" };
    }
    const blocked = await this.blockReason(page, response);
    if (blocked) {
      return { kind: "unknown", reason: blocked };
    }

    const listings = await this.readListings(page);
    if (listings.length > 0) {
      return { kind: "found", listings };
    }
    if (SITE.noResults.test(await this.visibleText(page))) {
      return { kind: "not-found" };
    }
    return { kind: "unknown", reason: "the page did not look like a results page" };
  }

  /**
   * The person looks for themselves in the visible window and tells us what
   * they found. "none" is their answer, not ours, so it is marked as theirs;
   * no answer leaves the scan "unknown".
   */
  private async guidedScan(reason: string, ctx: ExecutionContext): Promise<ScanResult> {
    const answer = await ctx.ioProvider.promptUser(
      `Whitepages could not be read automatically (${reason}).\n` +
        "In the browser window, search Whitepages for yourself.\n" +
        "Paste the address of each profile that is yours (separate several with spaces), " +
        "or type none if you are not listed. Leave empty to skip Whitepages for now.",
      { broker: "Whitepages" }
    );
    const reply = answer.trim();
    if (reply === "") {
      return { kind: "unknown", reason };
    }
    if (reply.toLowerCase() === "none") {
      return { kind: "not-found", source: "person" };
    }

    const listings: Listing[] = [];
    for (const token of reply.split(/[\s,]+/).filter(Boolean)) {
      const id = this.listingId(token);
      if (!id || new URL(id).pathname === SITE.suppressionPath) {
        ctx.ioProvider.log("warn", "That was not the address of a Whitepages profile.");
        return { kind: "unknown", reason: "the answer was not a Whitepages profile address" };
      }
      if (!listings.some((l) => l.id === id)) {
        listings.push({ id, url: id, summary: "The profile address you pasted" });
      }
    }
    return { kind: "found", listings };
  }

  private async readListings(page: Page): Promise<Listing[]> {
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => ({
        href: a.href,
        text: ((a.closest("article, li, [data-listing], .card") as HTMLElement | null) ?? a).innerText
      }))
    );

    const listings: Listing[] = [];
    for (const link of links) {
      const id = this.listingId(link.href);
      if (!id || !SITE.listingPath.test(new URL(id).pathname) || listings.some((l) => l.id === id)) {
        continue;
      }
      listings.push({ id, url: id, summary: link.text.replace(/\s+/g, " ").trim().slice(0, 200) });
    }
    return listings;
  }

  /** The address without query string or fragment, or null when it is not on this site. */
  private listingId(address: string): string | null {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return null;
    }
    if (url.origin !== this.origin || url.pathname === "/") {
      return null;
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
  }

  private async open(page: Page, url: string): Promise<Response | null> {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.timeout });
    } catch {
      return null;
    }
  }

  /** Why the page cannot be trusted as content, or null when it can. The tool does not try to get past it. */
  private async blockReason(
    page: Page,
    response: Response,
    options: { checkElements: boolean } = { checkElements: true }
  ): Promise<string | null> {
    const status = response.status();
    if (status >= 400) {
      return `the site refused the page (HTTP ${status})`;
    }
    const challengeElement = options.checkElements && (await page.locator(SITE.challengeElements).count()) > 0;
    if (challengeElement || SITE.challenge.test(await this.visibleText(page))) {
      return "the site showed a bot check";
    }
    return null;
  }

  private async visibleText(page: Page): Promise<string> {
    return page.evaluate(() => `${document.title}\n${document.body?.innerText ?? ""}`);
  }

  private async findNextButton(box: Locator): Promise<Locator | null> {
    const controls = box.locator("xpath=ancestor::form[1]").locator('button:visible, input[type="submit"]:visible');
    const matches: Locator[] = [];
    for (const control of await controls.all()) {
      const label = ((await control.getAttribute("value")) ?? (await control.innerText())).trim();
      if (SITE.nextButton.test(label)) {
        matches.push(control);
      }
    }
    return matches.length === 1 ? matches[0]! : null;
  }
}
