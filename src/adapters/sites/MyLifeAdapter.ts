import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";


export class MyLifeAdapter extends BaseAdapter {
  public name(): string { return "MyLife"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", "\n[MyLife] Starting opt-out process...");
    this.ioProvider.log("info", "[MyLife] Note: Process may vary for CA vs. non-CA residents.");

    await this.ioProvider.waitForConfirmation(
      "[MyLife] STEP 1: Initial setup:\n" +
      "  1. You're on the MyLife privacy/CCPA page\n" +
      "  2. Look for 'Do Not Sell My Personal Information' section\n" +
      "  3. There may be different options for CA vs. non-CA residents\n" +
      "  4. Click the appropriate opt-out link or button\n" +
      "Press Enter when you're on the opt-out form...",
      { broker: this.entry.name, ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}) }
    );

    await this.autoFillProfile(page, profile);
    this.ioProvider.log("info", "[MyLife] Form auto-fill completed.");

    await this.ioProvider.waitForConfirmation(
      "\n[MyLife] STEP 2: Complete opt-out request:\n" +
      "  1. Review all form fields and fill any missing information\n" +
      "  2. You may need to search for your profile first\n" +
      "  3. Select which profile(s) to opt out if multiple exist\n" +
      "  4. Complete any CAPTCHA if present\n" +
      "  5. Click the submit button\n" +
      "Press Enter after you've submitted the form...",
      { broker: this.entry.name }
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page);

    await this.ioProvider.waitForConfirmation(
      "\n[MyLife] STEP 3: Email verification:\n" +
      "  1. Check your email for a confirmation from MyLife\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any additional verification steps\n" +
      "Press Enter when you've completed email verification...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("success", "[MyLife] Opt-out process completed.");
    this.ioProvider.log("info", "[MyLife] Note: Removal timeline varies; can take several weeks.");
    this.ioProvider.log("warn", "[MyLife] IMPORTANT: Non-CA residents report mixed success. You may need to follow up.");
  }
}
