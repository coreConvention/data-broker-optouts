import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext } from "@playwright/test";

// No real browser: chromium.launch is replaced, so these tests only look at
// the options BrowserFactory hands to Playwright.
const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock("@playwright/test", () => ({
  chromium: { launch }
}));

import { BrowserFactory } from "../factories/BrowserFactory.js";
import { getMachineLocale, getStealthLaunchArgs, languageListFor } from "../utils/stealth.js";

const AUTOMATION_FLAG = "--disable-blink-features=AutomationControlled";

interface FakeBrowser {
  browser: Browser;
  newContext: ReturnType<typeof vi.fn>;
  addInitScript: ReturnType<typeof vi.fn>;
}

/** Makes Node report `locale` as the machine's language until mocks are restored. */
function pretendMachineLocale(locale: string): void {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), locale };
    }
  );
}

function fakeBrowser(): FakeBrowser {
  const addInitScript = vi.fn().mockResolvedValue(undefined);
  const context = { addInitScript } as unknown as BrowserContext;
  const newContext = vi.fn().mockResolvedValue(context);
  return {
    browser: { newContext } as unknown as Browser,
    newContext,
    addInitScript
  };
}

describe("BrowserFactory", () => {
  beforeEach(() => {
    launch.mockReset();
    launch.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createBrowser", () => {
    it("passes no launch flags when stealth is off", async () => {
      await BrowserFactory.createBrowser({ headful: false, stealth: false });

      expect(launch).toHaveBeenCalledTimes(1);
      const options = launch.mock.calls[0]![0];
      expect(options.args ?? []).toEqual([]);
      expect(options.headless).toBe(true);
    });

    it("passes the stealth launch flags when stealth is on", async () => {
      await BrowserFactory.createBrowser({ headful: true, stealth: true });

      const options = launch.mock.calls[0]![0];
      expect(options.args).toEqual(getStealthLaunchArgs());
      expect(options.args).toContain(AUTOMATION_FLAG);
      expect(options.headless).toBe(false);
    });
  });

  describe("createContext", () => {
    it("leaves the user agent at Playwright's default when stealth is off", async () => {
      const { browser, newContext, addInitScript } = fakeBrowser();

      await BrowserFactory.createContext(browser, { headful: false, stealth: false });

      const options = newContext.mock.calls[0]![0];
      expect(options.userAgent).toBeUndefined();
      expect(addInitScript).not.toHaveBeenCalled();
    });

    it("sets a desktop Chrome user agent and stealth scripts when stealth is on", async () => {
      const { browser, newContext, addInitScript } = fakeBrowser();

      await BrowserFactory.createContext(browser, { headful: false, stealth: true });

      const options = newContext.mock.calls[0]![0];
      expect(options.userAgent).toMatch(/^Mozilla\/5\.0 .*Chrome\/\d+/);
      expect(addInitScript).toHaveBeenCalled();
    });

    it("leaves the locale and timezone to the machine when stealth is off", async () => {
      const { browser, newContext } = fakeBrowser();

      await BrowserFactory.createContext(browser, { headful: false, stealth: false });

      const options = newContext.mock.calls[0]![0];
      expect(options.locale).toBeUndefined();
      expect(options.timezoneId).toBeUndefined();
      // Present-but-undefined would still be a key Playwright sees.
      expect(options).not.toHaveProperty("locale");
      expect(options).not.toHaveProperty("timezoneId");
    });

    it("reports the machine's language and leaves the timezone to the machine when stealth is on", async () => {
      pretendMachineLocale("de-DE");
      const { browser, newContext } = fakeBrowser();

      await BrowserFactory.createContext(browser, { headful: false, stealth: true });

      const options = newContext.mock.calls[0]![0];
      // Passed explicitly: with no locale a headless Chromium sends no
      // Accept-Language header at all (#58).
      expect(options.locale).toBe("de-DE");
      // Present-but-undefined would still be a key Playwright sees.
      expect(options).not.toHaveProperty("timezoneId");
    });

    it("hands the stealth script a language list that starts with the context's locale", async () => {
      pretendMachineLocale("de-DE");
      const { browser, newContext, addInitScript } = fakeBrowser();

      await BrowserFactory.createContext(browser, { headful: false, stealth: true });

      const options = newContext.mock.calls[0]![0];
      const languages: string[] = addInitScript.mock.calls[0]![1];
      expect(languages).toEqual(["de-DE", "de"]);
      expect(languages[0]).toBe(options.locale);
    });
  });

  describe("machine language", () => {
    it("reads the machine's locale as language and region only", () => {
      pretendMachineLocale("zh-Hans-CN");
      expect(getMachineLocale()).toBe("zh-CN");
      vi.restoreAllMocks();

      pretendMachineLocale("fr");
      expect(getMachineLocale()).toBe("fr");
    });

    it("lists the locale, then its bare language", () => {
      expect(languageListFor("en-US")).toEqual(["en-US", "en"]);
      expect(languageListFor("pt-BR")).toEqual(["pt-BR", "pt"]);
      expect(languageListFor("fr")).toEqual(["fr"]);
    });
  });
});
