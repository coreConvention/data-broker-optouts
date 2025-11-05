import type { BrowserContext, Page } from "@playwright/test";
import type { BrokerEntry, PersonProfile } from "../types.js";
import { promises as fs } from "fs";
import { join } from "path";

export abstract class BaseAdapter {
  protected readonly entry: BrokerEntry;

  public constructor(entry: BrokerEntry) {
    this.entry = entry;
  }

  public abstract name(): string;

  public async run(context: BrowserContext, profile: PersonProfile): Promise<void> {
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

      await this.execute(page, profile);
    } catch (error) {
      // Capture screenshot on error
      await this.captureErrorScreenshot(page, this.entry.name);
      throw error;
    } finally {
      await page.close();
    }
  }

  protected abstract execute(page: Page, profile: PersonProfile): Promise<void>;

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
          console.log(`[${this.name()}] ⚠ Retry ${attempt}/${maxRetries} for ${operationName} failed. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    console.log(`[${this.name()}] ✗ All ${maxRetries} attempts failed for ${operationName}`);
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
      console.log(`[${this.name()}] 📸 Screenshot saved: ${filepath}`);
    } catch (screenshotError) {
      console.log(`[${this.name()}] ⚠ Could not capture screenshot:`, screenshotError);
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
}