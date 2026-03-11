import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";


export class WhitepagesAdapter extends BaseAdapter {
  public name(): string { return "Whitepages"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", "\n[Whitepages] Starting suppression request process...");
    this.ioProvider.log("info", "[Whitepages] Note: You'll need to manually search for your listing first.");

    await this.ioProvider.waitForConfirmation(
      "[Whitepages] STEP 1: Search for your listing:\n" +
      "  1. In the browser, use the Whitepages search to find yourself\n" +
      "  2. Search by name, phone number, or address\n" +
      "  3. Locate your listing(s) in the results\n" +
      "  4. Navigate to the suppression request page\n" +
      "Press Enter when you're on the suppression request form...",
      { broker: this.entry.name, ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}) }
    );

    await this.autoFillProfile(page, profile);
    this.ioProvider.log("info", "[Whitepages] Form auto-fill completed.");

    await this.ioProvider.waitForConfirmation(
      "\n[Whitepages] STEP 2: Complete the suppression request form:\n" +
      "  1. Select a reason for opt-out from the dropdown\n" +
      "  2. Solve the CAPTCHA if present\n" +
      "  3. Agree to any terms/conditions checkboxes\n" +
      "  4. Enter your phone number for verification\n" +
      "  5. Click 'Call Now to Verify' button\n" +
      "Press Enter AFTER you've clicked the call verification button...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("info", "\n[Whitepages] ========================================");
    this.ioProvider.log("info", "[Whitepages] PHONE VERIFICATION IN PROGRESS");
    this.ioProvider.log("info", "[Whitepages] ========================================");
    this.ioProvider.log("info", "[Whitepages] You should receive an automated phone call NOW.");
    this.ioProvider.log("info", "[Whitepages] A verification code is displayed on your screen.");
    this.ioProvider.log("info", "[Whitepages] When you answer the call, enter this code using your phone keypad.");

    await this.ioProvider.waitForConfirmation(
      "\n[Whitepages] STEP 3: Complete phone verification:\n" +
      "  1. Answer the automated phone call from Whitepages\n" +
      "  2. Look at the verification code displayed on your screen\n" +
      "  3. Enter the code using your phone's keypad\n" +
      "  4. Wait for the confirmation message\n" +
      "Press Enter AFTER you've completed the phone verification...",
      { broker: this.entry.name }
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page);

    await this.ioProvider.waitForConfirmation(
      "\n[Whitepages] STEP 4: Final confirmation:\n" +
      "  1. Verify you see a success/confirmation message on screen\n" +
      "  2. Check your email for any confirmation (optional for Whitepages)\n" +
      "Press Enter when you've confirmed the opt-out was successful...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("success", "[Whitepages] Suppression request completed.");
    this.ioProvider.log("info", "[Whitepages] Note: Removal typically takes 24-48 hours.");
  }
}
