import type { Browser, BrowserContext, Page } from "@playwright/test";

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
 * Apply stealth configurations to a browser context
 */
export async function applyStealthToContext(context: BrowserContext, config: StealthConfig = defaultStealthConfig): Promise<void> {
  // Add initialization script to mask automation indicators
  await context.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
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
  });
}

/**
 * Apply stealth configurations to a specific page
 */
export async function applyStealthToPage(page: Page, config: StealthConfig = defaultStealthConfig): Promise<void> {
  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Upgrade-Insecure-Requests': '1',
  });

  // Add realistic timing for page interactions
  await page.addInitScript(() => {
    // Make mouse movements more human-like
    const originalEvaluate = window.eval;
    window.eval = function(script: string) {
      // Block common bot detection scripts
      if (script.includes('webdriver') || script.includes('__playwright')) {
        return undefined;
      }
      return originalEvaluate(script);
    };
  });
}

/**
 * Get a realistic user agent string
 */
export function getRealisticUserAgent(): string {
  const chromeVersion = 120 + Math.floor(Math.random() * 10); // Chrome 120-129
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
    '--disable-setuid-sandbox',
    '--no-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-running-insecure-content',
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
    '--hide-scrollbars',
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
