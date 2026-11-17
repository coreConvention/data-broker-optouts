import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { chromium } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { BrokerEntry, IOProvider, PersonProfile } from "../types.js";
import { BaseAdapter } from "../adapters/BaseAdapter.js";
import { MyLifeAdapter } from "../adapters/sites/MyLifeAdapter.js";
import { SpokeoAdapter } from "../adapters/sites/SpokeoAdapter.js";
import { NuwberAdapter } from "../adapters/sites/NuwberAdapter.js";
import { BeenVerifiedAdapter } from "../adapters/sites/BeenVerifiedAdapter.js";

// Every page here is a local HTML fixture loaded with setContent. No test
// visits a real site, and the profile is made-up test data (issue #29).
const profile: PersonProfile = {
  fullName: "Testy McFixture",
  email: "fixture.person@example.com",
  phone: "555-0100",
  address: "1 Fixture Lane",
  city: "Faketown",
  state: "California",
  zip: "90000",
};

/** Every value the adapters could type, including the split name parts. */
const PROFILE_VALUES: string[] = [
  "Testy McFixture", "Testy", "McFixture", "fixture.person@example.com",
  "555-0100", "1 Fixture Lane", "Faketown", "California", "90000",
];

const entry: BrokerEntry = {
  name: "FixtureBroker",
  removalUrl: "https://example.com/optout",
  requirements: ["online"],
  adapter: "generic",
};

/** Exposes the shared auto-fill helpers on an already-loaded fixture page. */
class TestableAdapter extends BaseAdapter {
  public constructor(io: IOProvider) {
    super(entry);
    this.ioProvider = io;
  }
  public name(): string { return "Fixture"; }
  protected async execute(): Promise<void> {}

  public autoFill(page: Page): Promise<void> { return this.autoFillProfile(page, profile); }
  public fillEmail(page: Page, allowSearchForm: boolean = false): Promise<boolean> {
    return this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email", { allowSearchForm });
  }
  public fillName(page: Page, allowSearchForm: boolean = false): Promise<boolean> {
    return this.tryFillField(page, BaseAdapter.NAME_SELECTORS, profile.fullName, "Name", { allowSearchForm });
  }
  public fillState(page: Page): Promise<boolean> {
    return this.tryFillStateField(page, BaseAdapter.STATE_SELECTORS, "California");
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

/** Everything the adapter sent to the log, as one string. */
function logged(io: IOProvider): string {
  return vi.mocked(io.log).mock.calls.map(call => call.join(" ")).join("\n");
}

function expectNoProfileValuesLogged(io: IOProvider): void {
  const text: string = logged(io);
  for (const value of PROFILE_VALUES) {
    expect(text).not.toContain(value);
  }
}

const NEWSLETTER_FORM = `
  <form id="newsletter">
    <h2>Get our marketing insights</h2>
    <input type="email" name="email" placeholder="Work email">
    <input type="checkbox" name="agree_marketing" id="agree-marketing">
    <button type="submit">Subscribe Now</button>
  </form>`;

const LOGIN_FORM = `
  <form id="login">
    <input id="username" placeholder="Email or username">
    <input type="password" name="password">
    <button type="submit">Continue</button>
  </form>`;

const SITE_SEARCH_FORM = `
  <form id="sitesearch">
    <input name="q" placeholder="Search by name">
    <button type="submit">Search</button>
  </form>`;

const OPT_OUT_FORM = `
  <form id="optout">
    <input name="name" placeholder="Full name">
    <input type="email" name="email" placeholder="Email">
    <input type="tel" name="phone">
    <input name="address">
    <input name="city">
    <select name="state"><option value="">Pick</option><option value="CA">California</option></select>
    <input name="zip">
    <input type="checkbox" name="agree" id="agree-terms">
    <button type="submit">Submit Opt-Out Request</button>
  </form>`;

const RECORD_SEARCH_FORM = `
  <form id="recordsearch">
    <input name="firstName">
    <input name="lastName">
    <input name="city">
    <select name="state"><option value="">Pick</option><option value="CA">California</option></select>
    <button type="submit">Search</button>
  </form>`;

function pageOf(...parts: string[]): string {
  return `<html><body><h1>Opt out of our database</h1>${parts.join("\n")}</body></html>`;
}

/** The current value of every input and select, keyed "formId.name". */
async function valuesOn(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) {
      const key = `${el.form ? el.form.id : "no-form"}.${el.name || el.id}`;
      out[key] = el instanceof HTMLInputElement && el.type === "checkbox" ? String(el.checked) : el.value;
    }
    return out;
  });
}

function valuesOfForm(values: Record<string, string>, formId: string): string[] {
  return Object.entries(values).filter(([key]) => key.startsWith(`${formId}.`)).map(([, value]) => value);
}

function expectFormEmpty(values: Record<string, string>, formId: string): void {
  const formValues: string[] = valuesOfForm(values, formId);
  expect(formValues.length).toBeGreaterThan(0);
  expect(formValues.every(v => v === "" || v === "false")).toBe(true);
}

describe("BaseAdapter auto-fill (issue #29)", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let io: IOProvider;
  let adapter: TestableAdapter;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    io = createIOProvider();
    adapter = new TestableAdapter(io);
  });

  afterEach(async () => {
    await context.close();
  });

  describe("autoFillProfile", () => {
    it("fills the opt-out form and leaves a newsletter box before it empty", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, OPT_OUT_FORM));

      await adapter.autoFill(page);

      const values = await valuesOn(page);
      expectFormEmpty(values, "newsletter");
      expect(values["optout.email"]).toBe(profile.email);
      expect(values["optout.name"]).toBe(profile.fullName);
      expect(values["optout.phone"]).toBe(profile.phone);
      expect(values["optout.address"]).toBe(profile.address);
      expect(values["optout.city"]).toBe(profile.city);
      expect(values["optout.state"]).toBe("CA");
      expect(values["optout.zip"]).toBe(profile.zip);
    });

    it("leaves a login box before the opt-out form empty", async () => {
      await page.setContent(pageOf(LOGIN_FORM, OPT_OUT_FORM));

      await adapter.autoFill(page);

      const values = await valuesOn(page);
      expectFormEmpty(values, "login");
      expect(values["optout.email"]).toBe(profile.email);
    });

    it("types nothing when the only form is a newsletter sign-up", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM));

      await adapter.autoFill(page);

      expectFormEmpty(await valuesOn(page), "newsletter");
      expect(logged(io)).toContain("nothing was typed");
    });

    it("types nothing when two forms could both be the opt-out form", async () => {
      const second: string = OPT_OUT_FORM.replace('id="optout"', 'id="contact"').replace("Submit Opt-Out Request", "Send");
      await page.setContent(pageOf(second, OPT_OUT_FORM));

      await adapter.autoFill(page);

      const values = await valuesOn(page);
      expectFormEmpty(values, "contact");
      expectFormEmpty(values, "optout");
      expect(logged(io)).toContain("nothing was typed");
    });

    it("types nothing into fields that sit outside any form", async () => {
      await page.setContent(pageOf(`<input type="email" name="email"><input name="name"><button>Go</button>`));

      await adapter.autoFill(page);

      expectFormEmpty(await valuesOn(page), "no-form");
      expect(logged(io)).toContain("nothing was typed");
    });

    it("types nothing into a form that has no submit control", async () => {
      await page.setContent(pageOf(`<form id="bare"><input type="email" name="email"><input name="name"></form>`));

      await adapter.autoFill(page);

      expectFormEmpty(await valuesOn(page), "bare");
    });

    it("logs field names only, never the values it typed", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, OPT_OUT_FORM));

      await adapter.autoFill(page);

      const text: string = logged(io);
      for (const label of ["Email filled", "Name filled", "Phone filled", "Address filled", "City filled", "State filled", "ZIP filled"]) {
        expect(text).toContain(label);
      }
      expectNoProfileValuesLogged(io);
    });
  });

  describe("tryFillField / tryFillStateField", () => {
    it("fills only the opt-out form's field and logs no value", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, LOGIN_FORM, OPT_OUT_FORM));

      expect(await adapter.fillEmail(page)).toBe(true);
      expect(await adapter.fillName(page)).toBe(true);
      expect(await adapter.fillState(page)).toBe(true);

      const values = await valuesOn(page);
      expectFormEmpty(values, "newsletter");
      expectFormEmpty(values, "login");
      expect(values["optout.email"]).toBe(profile.email);
      expect(values["optout.name"]).toBe(profile.fullName);
      expect(values["optout.state"]).toBe("CA");
      expectNoProfileValuesLogged(io);
    });

    it("returns false and says so when no form holds the field", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM));

      expect(await adapter.fillEmail(page)).toBe(false);

      expectFormEmpty(await valuesOn(page), "newsletter");
      expect(logged(io)).toContain("Email: no single opt-out form");
      expectNoProfileValuesLogged(io);
    });

    it("stays out of a site search box unless the step is a record search", async () => {
      await page.setContent(pageOf(SITE_SEARCH_FORM));

      expect(await adapter.fillName(page)).toBe(false);
      expectFormEmpty(await valuesOn(page), "sitesearch");

      expect(await adapter.fillName(page, true)).toBe(true);
      expect((await valuesOn(page))["sitesearch.q"]).toBe(profile.fullName);
    });
  });

  describe("site adapters on fixtures", () => {
    /** Runs a real site adapter's steps on an already-loaded fixture page. */
    async function runSteps(adapterUnderTest: BaseAdapter): Promise<void> {
      const runnable = adapterUnderTest as unknown as {
        ioProvider: IOProvider;
        execute(page: Page, profile: PersonProfile): Promise<void>;
      };
      runnable.ioProvider = io;
      await runnable.execute(page, profile);
    }

    it("MyLife (autoFillProfile) leaves the newsletter box empty and logs no values", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, OPT_OUT_FORM));

      await runSteps(new MyLifeAdapter(entry));

      const values = await valuesOn(page);
      expectFormEmpty(values, "newsletter");
      expect(values["optout.email"]).toBe(profile.email);
      expectNoProfileValuesLogged(io);
    });

    it("Spokeo (tryFillField) leaves the login box empty and logs no values", async () => {
      await page.setContent(pageOf(LOGIN_FORM, OPT_OUT_FORM));

      await runSteps(new SpokeoAdapter(entry));

      const values = await valuesOn(page);
      expectFormEmpty(values, "login");
      expect(values["optout.email"]).toBe(profile.email);
      expect(values["optout.name"]).toBe(profile.fullName);
      expectNoProfileValuesLogged(io);
    });

    it("Nuwber ticks the opt-out form's agreement box, not the newsletter's", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, OPT_OUT_FORM));

      await runSteps(new NuwberAdapter(entry));

      const values = await valuesOn(page);
      expectFormEmpty(values, "newsletter");
      expect(values["optout.agree"]).toBe("true");
      expect(values["optout.email"]).toBe(profile.email);
      expectNoProfileValuesLogged(io);
    });

    it("BeenVerified fills the record search form but not the newsletter box", async () => {
      await page.setContent(pageOf(NEWSLETTER_FORM, RECORD_SEARCH_FORM));

      await runSteps(new BeenVerifiedAdapter(entry));

      const values = await valuesOn(page);
      expectFormEmpty(values, "newsletter");
      expect(values["recordsearch.firstName"]).toBe("Testy");
      expect(values["recordsearch.lastName"]).toBe("McFixture");
      expect(values["recordsearch.city"]).toBe(profile.city);
      expect(values["recordsearch.state"]).toBe("CA");
      expectNoProfileValuesLogged(io);
    });
  });
});
