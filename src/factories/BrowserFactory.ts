import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import {
  applyStealthToContext,
  getRealisticUserAgent,
  getRealisticViewport,
  getStealthLaunchArgs
} from "../utils/stealth.js";

/**
 * Configuration for browser factory
 */
export interface BrowserConfig {
  headful: boolean;
  stealth: boolean;
}

/**
 * Factory for creating and configuring browser instances
 * Single Responsibility: Browser and context setup
 *
 * Follows Factory Pattern and encapsulates browser configuration complexity
 */
export class BrowserFactory {
  /**
   * Create and configure a browser instance
   *
   * @param config - Browser configuration options
   * @returns Configured browser instance
   */
  public static async createBrowser(config: BrowserConfig): Promise<Browser> {
    const launchArgs = config.stealth
      ? getStealthLaunchArgs()
      : ["--disable-blink-features=AutomationControlled"];

    const browser = await chromium.launch({
      headless: !config.headful,
      args: launchArgs
    });

    return browser;
  }

  /**
   * Create and configure a browser context
   *
   * @param browser - Browser instance
   * @param config - Browser configuration options
   * @returns Configured browser context
   */
  public static async createContext(
    browser: Browser,
    config: BrowserConfig
  ): Promise<BrowserContext> {
    const viewport = config.stealth
      ? getRealisticViewport()
      : { width: 1280, height: 900 };

    const userAgent = config.stealth
      ? getRealisticUserAgent()
      : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome Safari";

    const context = await browser.newContext({
      viewport,
      userAgent,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: [],
      colorScheme: 'light',
      deviceScaleFactor: 1,
    });

    // Apply stealth scripts if enabled
    if (config.stealth) {
      await applyStealthToContext(context);
    }

    return context;
  }

  /**
   * Create both browser and context in one call (convenience method)
   *
   * @param config - Browser configuration options
   * @returns Object containing browser and context
   */
  public static async createBrowserWithContext(
    config: BrowserConfig
  ): Promise<{ browser: Browser; context: BrowserContext }> {
    const browser = await this.createBrowser(config);
    const context = await this.createContext(browser, config);

    return { browser, context };
  }
}
