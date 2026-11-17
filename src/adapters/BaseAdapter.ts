import type { BrowserContext, Page } from "@playwright/test";
import type { AdapterOutcome, BrokerEntry, PersonProfile, IOProvider, ExecutionContext } from "../types.js";
import { promises as fs } from "fs";
import { join } from "path";

export abstract class BaseAdapter {
  protected readonly entry: BrokerEntry;
  protected ioProvider: IOProvider = {
    promptUser: async () => "",
    waitForConfirmation: async () => {},
    log: (_level, msg) => console.log(msg),
    openExternal: async () => {},
    shouldOpenInBrowser: () => false,
  };

  public constructor(entry: BrokerEntry) {
    this.entry = entry;
  }

  public abstract name(): string;

  /**
   * Opens the broker's page and runs the adapter on it.
   *
   * @returns "submitted" when the adapter sent the opt-out itself, "manual"
   * when it left the opt-out to the person. The orchestrator records the
   * broker's status from this, so an adapter that did not submit must say so.
   */
  public async run(context: BrowserContext, profile: PersonProfile, execContext?: ExecutionContext): Promise<AdapterOutcome> {
    if (execContext) {
      this.ioProvider = execContext.ioProvider;
    }
    const page = await context.newPage();
    try {
      if (!this.entry.removalUrl) throw new Error("No removalUrl provided.");

      // Navigate with retry logic
      await this.retryOperation(
        async () => {
          await page.goto(this.entry.removalUrl!, { waitUntil: "load", timeout: 60_000 });
        },
        3,
        2000,
        `navigating to ${this.entry.removalUrl}`
      );

      return (await this.execute(page, profile)) ?? "submitted";
    } catch (error) {
      // Capture screenshot on error
      await this.captureErrorScreenshot(page, this.entry.name);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Site-specific steps. Returning nothing means "submitted", which is what
   * the hand-written site adapters do; return "manual" when nothing was sent.
   */
  protected abstract execute(page: Page, profile: PersonProfile): Promise<AdapterOutcome | void>;

  protected async ensureVisible(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
  }

  /**
   * Retry an operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 2000,
    operationName: string = "operation"
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const backoffDelay = delayMs * Math.pow(2, attempt - 1);
          this.ioProvider.log("warn", `[${this.name()}] Retry ${attempt}/${maxRetries} for ${operationName} failed. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    this.ioProvider.log("error", `[${this.name()}] All ${maxRetries} attempts failed for ${operationName}`);
    throw lastError;
  }

  /**
   * Capture screenshot on error for debugging
   */
  protected async captureErrorScreenshot(page: Page, siteName: string): Promise<void> {
    try {
      const logsDir = "./logs";

      // Create logs directory if it doesn't exist
      try {
        await fs.mkdir(logsDir, { recursive: true });
      } catch {}

      const timestamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
      const filename = `error-${siteName}-${timestamp}.png`;
      const filepath = join(logsDir, filename);

      await page.screenshot({ path: filepath, fullPage: true });
      this.ioProvider.log("info", `[${this.name()}] Screenshot saved: ${filepath}`);
    } catch (screenshotError) {
      this.ioProvider.log("warn", `[${this.name()}] Could not capture screenshot: ${screenshotError}`);
    }
  }

  /**
   * Try to detect success indicators on the page
   */
  protected async detectSuccess(page: Page, indicators: string[]): Promise<boolean> {
    for (const indicator of indicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  /** Common success indicator selectors used across most adapters */
  protected static readonly DEFAULT_SUCCESS_INDICATORS = [
    "text=/success/i",
    "text=/submitted/i",
    "text=/confirmation/i",
    "text=/email.*sent/i",
    "text=/request.*received/i",
    "text=/thank you/i",
    "text=/opt.*out.*complete/i",
    "text=/removed/i",
    "text=/request.*processed/i",
  ];

  /**
   * Detect success using default indicators and log the result.
   * Returns true if any success indicator was found.
   */
  protected async detectAndLogSuccess(page: Page, extraIndicators: string[] = []): Promise<boolean> {
    const indicators = [...BaseAdapter.DEFAULT_SUCCESS_INDICATORS, ...extraIndicators];
    const detected = await this.detectSuccess(page, indicators);
    if (detected) {
      this.ioProvider.log("success", `[${this.name()}] Success message detected!`);
    } else {
      this.ioProvider.log("warn", `[${this.name()}] Could not detect success message. Please verify manually.`);
    }
    return detected;
  }

  /**
   * Try to fill a field by probing multiple selectors in order.
   * Returns true if a field was filled.
   */
  protected async tryFillField(
    page: Page,
    selectors: string[],
    value: string,
    fieldLabel: string,
    timeoutMs: number = 1500
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: timeoutMs })) {
          await locator.fill(value);
          this.ioProvider.log("info", `[${this.name()}] ${fieldLabel} filled: ${value}`);
          return true;
        }
      } catch {}
    }
    return false;
  }

  /**
   * Try to fill a state field that could be a <select> or text <input>.
   */
  protected async tryFillStateField(
    page: Page,
    selectors: string[],
    value: string,
    timeoutMs: number = 1000
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: timeoutMs })) {
          try {
            await page.selectOption(selector, { label: value });
          } catch {
            try {
              await page.selectOption(selector, { value });
            } catch {
              await locator.fill(value);
            }
          }
          this.ioProvider.log("info", `[${this.name()}] State filled: ${value}`);
          return true;
        }
      } catch {}
    }
    return false;
  }

  /** Common selectors for email fields */
  protected static readonly EMAIL_SELECTORS = [
    "input[type='email']",
    "input[name='email']",
    "input[id*='email']",
    "input[placeholder*='email' i]",
  ];

  /** Common selectors for full name fields */
  protected static readonly NAME_SELECTORS = [
    "input[name='name']",
    "input[name='fullName']",
    "input[name='full_name']",
    "input[id*='name']",
    "input[placeholder*='name' i]",
  ];

  /** Common selectors for phone fields */
  protected static readonly PHONE_SELECTORS = [
    "input[type='tel']",
    "input[name='phone']",
    "input[name='phoneNumber']",
    "input[id*='phone']",
    "input[placeholder*='phone' i]",
  ];

  /** Common selectors for address fields */
  protected static readonly ADDRESS_SELECTORS = [
    "input[name='address']",
    "input[id*='address']",
    "input[placeholder*='address' i]",
  ];

  /** Common selectors for city fields */
  protected static readonly CITY_SELECTORS = [
    "input[name='city']",
    "input[placeholder*='city' i]",
  ];

  /** Common selectors for state fields */
  protected static readonly STATE_SELECTORS = [
    "select[name='state']",
    "input[name='state']",
  ];

  /** Common selectors for zip fields */
  protected static readonly ZIP_SELECTORS = [
    "input[name='zip']",
    "input[name='zipcode']",
    "input[placeholder*='zip' i]",
  ];

  /** Common selectors for first name fields */
  protected static readonly FIRST_NAME_SELECTORS = [
    "input[name='firstName']",
    "input[name='first_name']",
    "input[id*='firstName']",
    "input[placeholder*='first name' i]",
  ];

  /** Common selectors for last name fields */
  protected static readonly LAST_NAME_SELECTORS = [
    "input[name='lastName']",
    "input[name='last_name']",
    "input[id*='lastName']",
    "input[placeholder*='last name' i]",
  ];

  /**
   * Auto-fill common profile fields on a page.
   * Tries email, name, phone, address, city, state, zip in order.
   */
  protected async autoFillProfile(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", `[${this.name()}] Attempting to auto-fill form fields...`);

    await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email", 2000);
    await this.tryFillField(page, BaseAdapter.NAME_SELECTORS, profile.fullName, "Name");

    if (profile.phone) {
      await this.tryFillField(page, BaseAdapter.PHONE_SELECTORS, profile.phone, "Phone");
    }
    if (profile.address) {
      await this.tryFillField(page, BaseAdapter.ADDRESS_SELECTORS, profile.address, "Address");
    }
    if (profile.city) {
      await this.tryFillField(page, BaseAdapter.CITY_SELECTORS, profile.city, "City", 1000);
    }
    if (profile.state) {
      await this.tryFillStateField(page, BaseAdapter.STATE_SELECTORS, profile.state);
    }
    if (profile.zip) {
      await this.tryFillField(page, BaseAdapter.ZIP_SELECTORS, profile.zip, "ZIP", 1000);
    }
  }
}