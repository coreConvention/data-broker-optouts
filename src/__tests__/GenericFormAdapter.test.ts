import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AdapterOutcome, BrokerEntry, IOProvider, PersonProfile } from "../types.js";
import type { Logger } from "../utils/logger.js";
import { GenericFormAdapter } from "../adapters/GenericFormAdapter.js";
import { ExecutionOrchestrator } from "../services/ExecutionOrchestrator.js";

// Every page here is a local HTML fixture loaded with setContent or a data:
// URL. No test visits a real site, and the profile is made-up test data.
const profile: PersonProfile = { fullName: "Test Person", email: "test@example.com" };

/** Runs the adapter's steps on an already-loaded fixture page. */
class TestableGenericFormAdapter extends GenericFormAdapter {
  public runOn(page: Page, io: IOProvider): Promise<AdapterOutcome> {
    this.ioProvider = io;
    return this.execute(page, profile);
  }
}

function createIOProvider(): IOProvider {
  return {
    promptUser: vi.fn().mockResolvedValue(""),
    waitForConfirmation: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    shouldOpenInBrowser: vi.fn().mockReturnValue(false),
  };
}

/**
 * Records everything a visitor (or the adapter) does to the page: each
 * keystroke-level input, each click, and which form was submitted. Submits are
 * cancelled so nothing navigates.
 */
const RECORDER = `
  <script>
    window.__typed = [];
    window.__clicked = [];
    window.__submitted = [];
    document.addEventListener("input", e => window.__typed.push(e.target.form ? e.target.form.id : "no-form"), true);
    document.addEventListener("click", e => window.__clicked.push(e.target.textContent || e.target.value || e.target.tagName), true);
    document.addEventListener("submit", e => { e.preventDefault(); window.__submitted.push(e.target.id); }, true);
  </script>`;

const NEWSLETTER_FORM = `
  <form id="newsletter">
    <h2>Get our marketing insights</h2>
    <input type="email" name="email" placeholder="Work email">
    <button type="submit">Subscribe Now</button>
  </form>`;

const OPT_OUT_FORM = `
  <form id="optout">
    <input name="name" placeholder="Full name">
    <input type="email" name="email" placeholder="Email">
    <button type="submit">Submit Opt-Out Request</button>
  </form>`;

const OPT_OUT_PAGE = `<html><body><h1>Opt out of our database</h1>${OPT_OUT_FORM}${RECORDER}</body></html>`;

// The newsletter form comes first, so every loose selector matches it first.
const NEWSLETTER_BESIDE_OPT_OUT_PAGE =
  `<html><body>${NEWSLETTER_FORM}<h1>Opt out of our database</h1>${OPT_OUT_FORM}${RECORDER}</body></html>`;

// What the live Lotame page looked like: opt-out wording, but the only form is a sign-up.
const NEWSLETTER_ONLY_PAGE =
  `<html><body><h1>Opt out</h1><p>To opt out, email our privacy team.</p>${NEWSLETTER_FORM}${RECORDER}</body></html>`;

const NO_OPT_OUT_WORDING_PAGE = `<html><body><h1>Contact our sales team</h1>
  <form id="contact">
    <input name="name" placeholder="Full name">
    <input type="email" name="email" placeholder="Email">
    <button type="submit">Send</button>
  </form>${RECORDER}</body></html>`;

const selectors = { name: "input[name='name']", email: "input[type='email']", submit: "button[type='submit']" };

function entry(overrides: Partial<BrokerEntry> = {}): BrokerEntry {
  return {
    name: "FixtureBroker",
    removalUrl: "https://example.com/optout",
    requirements: ["online"],
    adapter: "generic",
    notes: "Search by name and state before opting out.",
    config: { selectors },
    ...overrides,
  };
}

interface PageActivity {
  typed: string[];
  clicked: string[];
  submitted: string[];
  values: string[];
}

async function activityOn(page: Page): Promise<PageActivity> {
  return page.evaluate(() => {
    const w = window as unknown as { __typed: string[]; __clicked: string[]; __submitted: string[] };
    return {
      typed: w.__typed,
      clicked: w.__clicked,
      submitted: w.__submitted,
      values: Array.from(document.querySelectorAll("input")).map(i => i.value),
    };
  });
}

function expectUntouched(activity: PageActivity): void {
  expect(activity.typed).toEqual([]);
  expect(activity.clicked).toEqual([]);
  expect(activity.submitted).toEqual([]);
  expect(activity.values.every(v => v === "")).toBe(true);
}

describe("GenericFormAdapter", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
    vi.restoreAllMocks();
  });

  describe("unverified entry", () => {
    it("types nothing and clicks nothing, even on a real-looking opt-out form", async () => {
      await page.setContent(OPT_OUT_PAGE);
      const io = createIOProvider();

      const outcome = await new TestableGenericFormAdapter(entry()).runOn(page, io);

      expect(outcome).toBe("manual");
      expectUntouched(await activityOn(page));
    });

    it("treats verified: false the same as a missing flag", async () => {
      await page.setContent(OPT_OUT_PAGE);

      const outcome = await new TestableGenericFormAdapter(entry({ verified: false })).runOn(page, createIOProvider());

      expect(outcome).toBe("manual");
      expectUntouched(await activityOn(page));
    });

    it("hands over to the person with the reason, the find-your-listing step and the entry's notes", async () => {
      await page.setContent(OPT_OUT_PAGE);
      const io = createIOProvider();

      await new TestableGenericFormAdapter(entry()).runOn(page, io);

      expect(io.waitForConfirmation).toHaveBeenCalledTimes(1);
      const [message, options] = vi.mocked(io.waitForConfirmation).mock.calls[0]!;
      expect(message).toContain("FixtureBroker");
      expect(message).toContain("unverified");
      expect(message).toContain("Find your listing");
      expect(message).toContain("by hand");
      expect(message).toContain("Search by name and state before opting out.");
      expect(options).toEqual({ broker: "FixtureBroker", url: "https://example.com/optout" });
    });

    it("is recorded as manual-needed, not success, by the orchestrator", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const append = vi.fn().mockResolvedValue(undefined);
      const logger = { append, path: () => "test.jsonl" } as unknown as Logger;
      const io = createIOProvider();
      const orchestrator = new ExecutionOrchestrator(logger, { dryRun: false, delayBetweenBrokers: 0 }, io);
      const dataUrl = `data:text/html,${encodeURIComponent(OPT_OUT_PAGE)}`;

      await orchestrator.executeAll([entry({ removalUrl: dataUrl })], profile, context);

      const stats = orchestrator.getStatistics().getStatistics();
      expect(stats.manualNeeded).toBe(1);
      expect(stats.success).toBe(0);
      expect(append).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledWith(expect.objectContaining({ site: "FixtureBroker", status: "manual-needed" }));
      expect(io.waitForConfirmation).toHaveBeenCalledTimes(1);
    });
  });

  describe("verified entry", () => {
    it("fills and submits the opt-out form", async () => {
      await page.setContent(OPT_OUT_PAGE);

      const outcome = await new TestableGenericFormAdapter(entry({ verified: true })).runOn(page, createIOProvider());

      const activity = await activityOn(page);
      expect(outcome).toBe("submitted");
      expect(activity.submitted).toEqual(["optout"]);
      expect(activity.values).toEqual(["Test Person", "test@example.com"]);
    });

    it("does not touch a newsletter form that sits beside the opt-out form", async () => {
      await page.setContent(NEWSLETTER_BESIDE_OPT_OUT_PAGE);

      const outcome = await new TestableGenericFormAdapter(entry({ verified: true })).runOn(page, createIOProvider());

      const activity = await activityOn(page);
      expect(outcome).toBe("submitted");
      expect(activity.submitted).toEqual(["optout"]);
      expect(activity.clicked).toEqual(["Submit Opt-Out Request"]);
      expect(activity.typed).not.toContain("newsletter");
      // First input on the page is the newsletter's email box: it must stay empty
      expect(activity.values).toEqual(["", "Test Person", "test@example.com"]);
    });

    it("does not click Subscribe when a newsletter form is the only form on an opt-out page", async () => {
      await page.setContent(NEWSLETTER_ONLY_PAGE);
      const io = createIOProvider();
      const emailOnly = entry({ verified: true, config: { selectors: { email: selectors.email, submit: selectors.submit } } });

      const outcome = await new TestableGenericFormAdapter(emailOnly).runOn(page, io);

      expect(outcome).toBe("manual");
      expectUntouched(await activityOn(page));
      expect(io.waitForConfirmation).toHaveBeenCalledTimes(1);
    });

    it("falls back to the manual hand-over when the page has no opt-out wording", async () => {
      await page.setContent(NO_OPT_OUT_WORDING_PAGE);
      const io = createIOProvider();

      const outcome = await new TestableGenericFormAdapter(entry({ verified: true })).runOn(page, io);

      expect(outcome).toBe("manual");
      expectUntouched(await activityOn(page));
      expect(io.waitForConfirmation).toHaveBeenCalledTimes(1);
      expect(vi.mocked(io.waitForConfirmation).mock.calls[0]![0]).toContain("does not mention opt-out");
    });

    it("falls back without typing when the entry has no submit selector", async () => {
      await page.setContent(OPT_OUT_PAGE);
      const noSubmit = entry({ verified: true, config: { selectors: { name: selectors.name, email: selectors.email } } });

      const outcome = await new TestableGenericFormAdapter(noSubmit).runOn(page, createIOProvider());

      expect(outcome).toBe("manual");
      expectUntouched(await activityOn(page));
    });
  });
});
