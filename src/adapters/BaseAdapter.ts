import type { BrowserContext, Page } from "@playwright/test";
import type { BrokerEntry, PersonProfile } from "../types.js";

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
      await page.goto(this.entry.removalUrl, { waitUntil: "load", timeout: 60_000 });
      await this.execute(page, profile);
    } finally {
      await page.close();
    }
  }

  protected abstract execute(page: Page, profile: PersonProfile): Promise<void>;

  protected async ensureVisible(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
  }
}