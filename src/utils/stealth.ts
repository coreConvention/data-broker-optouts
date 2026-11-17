import type { BrowserContext, Page } from "@playwright/test";

/**
 * Anti-detection configurations for Playwright
 * Helps bypass basic bot detection measures
 */

export interface StealthConfig {
  maskWebDriver: boolean;
  maskChrome: boolean;
  maskPermissions: boolean;
  mockPlugins: boolean;
  mockLanguages: boolean;
  evasions: boolean;
}

export const defaultStealthConfig: StealthConfig = {
  maskWebDriver: true,
  maskChrome: true,
  maskPermissions: true,
  mockPlugins: true,
  mockLanguages: true,
  evasions: true,
};

/**
 * The machine's own language as a browser locale, for example `de-DE`.
 *
 * Read in Node and handed to the browser as its `locale`, because a headless
 * Chromium that is given no locale sends no Accept-Language header at all,
 * which gives the disguise away faster than any fixed language would (#58).
 */
export function getMachineLocale(): string {
  const locale = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale);
  return locale.region ? `${locale.language}-${locale.region}` : locale.language;
}

/**
 * The `navigator.languages` list a desktop Chrome reports for a locale: the
 * locale itself, then its bare language (`de-DE` gives `['de-DE', 'de']`).
 */
export function languageListFor(locale: string): string[] {
  const language = locale.split('-')[0]!;
  return language === locale ? [locale] : [locale, language];
}

/**
 * Apply stealth configurations to a browser context
 *
 * @param locale - The locale the context was created with. The language list
 *   the page sees is built from it, so `navigator.language`,
 *   `navigator.languages` and the Accept-Language header name the same
 *   language (#58).
 */
export async function applyStealthToContext(
  context: BrowserContext,
  locale: string,
  _config: StealthConfig = defaultStealthConfig
): Promise<void> {
  // Add initialization script to mask automation indicators
  await context.addInitScript((languages: string[]) => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Mock plugins with realistic Plugin-like objects
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const makePlugin = (name: string, description: string, filename: string) => ({
          name, description, filename, length: 1,
          item: () => ({ type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: null }),
          namedItem: () => null,
          [Symbol.iterator]: function* () { yield this.item(); },
        });
        return [
          makePlugin('Chrome PDF Plugin', 'Portable Document Format', 'internal-pdf-viewer'),
          makePlugin('Chrome PDF Viewer', '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai'),
          makePlugin('Native Client', '', 'internal-nacl-plugin'),
        ];
      },
    });

    // Headless Chromium reports a one-entry language list; a desktop Chrome
    // also lists the bare language.
    Object.defineProperty(navigator, 'languages', {
      get: () => languages,
    });

    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: 'denied' } as PermissionStatus) :
        originalQuery(parameters)
    );

    // Mock chrome object
    (window as any).chrome = {
      runtime: {},
    };

    // Mask automation via console.debug
    const originalDebug = console.debug;
    console.debug = function(...args: any[]) {
      if (args[0]?.includes && args[0].includes('DevTools')) {
        return;
      }
      return originalDebug.apply(console, args);
    };
  }, languageListFor(locale));
}

/**
 * Get a realistic user agent string
 */
export function getRealisticUserAgent(): string {
  const chromeVersion = 130 + Math.floor(Math.random() * 7); // Chrome 130-136
  const osVersions = [
    'Windows NT 10.0; Win64; x64',
    'Macintosh; Intel Mac OS X 10_15_7',
    'X11; Linux x86_64',
  ];
  const os = osVersions[Math.floor(Math.random() * osVersions.length)];

  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;
}

/**
 * Get a realistic viewport size
 */
export function getRealisticViewport(): { width: number; height: number } {
  const commonViewports = [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ];

  return commonViewports[Math.floor(Math.random() * commonViewports.length)]!;
}

/**
 * Get realistic browser launch arguments
 */
export function getStealthLaunchArgs(): string[] {
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-extensions-with-background-pages',
    '--disable-extensions',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--password-store=basic',
    '--use-mock-keychain',
  ];
}

/**
 * Add random delays to mimic human behavior
 */
export async function humanDelay(minMs: number = 100, maxMs: number = 500): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Type text with human-like delays
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const element = page.locator(selector).first();
  await element.click();
  await humanDelay(50, 150);

  for (const char of text) {
    await element.pressSequentially(char, { delay: 50 + Math.random() * 100 });
  }

  await humanDelay(100, 300);
}

/**
 * Perform human-like mouse movement before clicking
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();

  if (box) {
    // Move mouse to random position near element
    await page.mouse.move(
      box.x + Math.random() * box.width,
      box.y + Math.random() * box.height,
      { steps: 5 + Math.floor(Math.random() * 10) }
    );
    await humanDelay(50, 150);
  }

  await element.click();
  await humanDelay(100, 300);
}

/**
 * Scroll page with human-like behavior
 */
export async function humanScroll(page: Page, distance: number = 500): Promise<void> {
  await page.evaluate((scrollDistance) => {
    window.scrollBy({
      top: scrollDistance,
      behavior: 'smooth'
    });
  }, distance);
  await humanDelay(200, 500);
}
