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
    // Stealth off means an undisguised browser: no launch flags at all, so
    // Chromium keeps reporting itself as automated (navigator.webdriver).
    // People turn stealth off to stay inside a site's terms of service (#32).
    const browser = await chromium.launch({
      headless: !config.headful,
      ...(config.stealth ? { args: getStealthLaunchArgs() } : {})
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

    const context = await browser.newContext({
      viewport,
      // With stealth off the user agent is left unset, so the browser sends
      // Playwright's default (Chromium's own) and not a made-up string (#32).
      // Locale and timezone are left unset too, so the browser reports the
      // machine's own and not a fixed US English / New York pair (#52).
      //
      // With stealth on the timezone is left unset as well: a fixed New York
      // timezone that does not match where the person's connection comes from
      // is a common bot-detection signal, so the machine's own is the better
      // disguise (#56). The locale stays en-US because the stealth script
      // reports a fixed ['en-US', 'en'] language list, and the two must agree.
      ...(config.stealth
        ? {
            userAgent: getRealisticUserAgent(),
            locale: 'en-US'
          }
        : {}),
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
