import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext } from "@playwright/test";

// No real browser: chromium.launch is replaced, so these tests only look at
// the options BrowserFactory hands to Playwright.
const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock("@playwright/test", () => ({
  chromium: { launch }
}));

import { BrowserFactory } from "../factories/BrowserFactory.js";
import { getStealthLaunchArgs } from "../utils/stealth.js";

const AUTOMATION_FLAG = "--disable-blink-features=AutomationControlled";

interface FakeBrowser {
  browser: Browser;
  newContext: ReturnType<typeof vi.fn>;
  addInitScript: ReturnType<typeof vi.fn>;
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
  });
});
