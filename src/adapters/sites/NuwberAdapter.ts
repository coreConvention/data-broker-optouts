import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";


export class NuwberAdapter extends BaseAdapter {
  public name(): string { return "Nuwber"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", "\n[Nuwber] Starting opt-out process...");
    this.ioProvider.log("info", "[Nuwber] Note: You need to search for your profile first at nuwber.com");

    await this.ioProvider.waitForConfirmation(
      "[Nuwber] STEP 1: Search for your profile:\n" +
      "  1. Search for your name and location at nuwber.com\n" +
      "  2. Find your profile in the search results\n" +
      "  3. Click 'View Details' to open your profile\n" +
      "  4. Scroll to bottom and click 'Remove My Info' or use the removal link\n" +
      "Press Enter when you're on the opt-out page...",
      { broker: this.entry.name, ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}) }
    );

    this.ioProvider.log("info", "[Nuwber] Attempting to auto-fill form fields...");
    await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email");

    // Check for agreement checkbox
    const checkboxSelectors = [
      "input[type='checkbox'][name*='agree']",
      "input[type='checkbox'][name*='confirm']",
      "input[type='checkbox'][id*='agree']",
    ];
    await this.tryCheckBox(page, checkboxSelectors, "Agreement checkbox");

    await this.ioProvider.waitForConfirmation(
      "\n[Nuwber] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify the email address is correct\n" +
      "  2. Check any required agreement checkboxes\n" +
      "  3. Solve the CAPTCHA if present\n" +
      "  4. Click the 'Opt Out' or 'Remove' button\n" +
      "Press Enter after you've clicked the submit button...",
      { broker: this.entry.name }
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page, ["text=/check.*email/i"]);

    await this.ioProvider.waitForConfirmation(
      "\n[Nuwber] STEP 3: Email verification required:\n" +
      "  1. Check your email inbox for a message from Nuwber\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any final steps on the verification page\n" +
      "Press Enter when you've completed email verification...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("success", "[Nuwber] Opt-out process completed.");
    this.ioProvider.log("info", "[Nuwber] Note: Removal typically takes 24 hours after email verification.");
  }
}
