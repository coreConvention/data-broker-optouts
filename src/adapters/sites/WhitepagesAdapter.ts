import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class WhitepagesAdapter extends BaseAdapter {
  public name(): string { return "Whitepages"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Whitepages] Starting suppression request process...");
    console.log("[Whitepages] Note: You'll need to manually search for your listing first.");

    await waitForEnter(
      "[Whitepages] STEP 1: Search for your listing:\n" +
      "  1. In the browser, use the Whitepages search to find yourself\n" +
      "  2. Search by name, phone number, or address\n" +
      "  3. Locate your listing(s) in the results\n" +
      "  4. Navigate to the suppression request page\n" +
      "Press Enter when you're on the suppression request form..."
    );

    await this.autoFillProfile(page, profile);
    console.log("[Whitepages] Form auto-fill completed.");

    await waitForEnter(
      "\n[Whitepages] STEP 2: Complete the suppression request form:\n" +
      "  1. Select a reason for opt-out from the dropdown\n" +
      "  2. Solve the CAPTCHA if present\n" +
      "  3. Agree to any terms/conditions checkboxes\n" +
      "  4. Enter your phone number for verification\n" +
      "  5. Click 'Call Now to Verify' button\n" +
      "Press Enter AFTER you've clicked the call verification button..."
    );

    console.log("\n[Whitepages] ========================================");
    console.log("[Whitepages] 📞 PHONE VERIFICATION IN PROGRESS");
    console.log("[Whitepages] ========================================");
    console.log("[Whitepages] You should receive an automated phone call NOW.");
    console.log("[Whitepages] A verification code is displayed on your screen.");
    console.log("[Whitepages] When you answer the call, enter this code using your phone keypad.");

    await waitForEnter(
      "\n[Whitepages] STEP 3: Complete phone verification:\n" +
      "  1. Answer the automated phone call from Whitepages\n" +
      "  2. Look at the verification code displayed on your screen\n" +
      "  3. Enter the code using your phone's keypad\n" +
      "  4. Wait for the confirmation message\n" +
      "Press Enter AFTER you've completed the phone verification..."
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page);

    await waitForEnter(
      "\n[Whitepages] STEP 4: Final confirmation:\n" +
      "  1. Verify you see a success/confirmation message on screen\n" +
      "  2. Check your email for any confirmation (optional for Whitepages)\n" +
      "Press Enter when you've confirmed the opt-out was successful..."
    );

    console.log("[Whitepages] ✓ Suppression request completed.");
    console.log("[Whitepages] Note: Removal typically takes 24-48 hours.");
  }
}
