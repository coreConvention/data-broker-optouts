import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class SpokeoAdapter extends BaseAdapter {
  public name(): string { return "Spokeo"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Spokeo] Starting opt-out process...");
    console.log("[Spokeo] Note: You'll need to manually search for and select your listing(s).");

    await waitForEnter(
      "[Spokeo] STEP 1: In the browser window:\n" +
      "  1. Search for your name/location on Spokeo\n" +
      "  2. Find your listing(s) in the results\n" +
      "  3. Click on the listing to view details\n" +
      "  4. Look for 'Remove this record' or 'Opt out' link\n" +
      "  5. Navigate to the opt-out form\n" +
      "Press Enter when you're on the opt-out form page..."
    );

    console.log("[Spokeo] Attempting to auto-fill email field...");
    const emailFilled = await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email", 2000);
    if (!emailFilled) {
      console.log("[Spokeo] ⚠ Could not auto-fill email. You may need to enter it manually.");
    }

    await this.tryFillField(page, BaseAdapter.NAME_SELECTORS, profile.fullName, "Name", 1000);

    await waitForEnter(
      "\n[Spokeo] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify all form fields are filled correctly\n" +
      "  2. Solve the CAPTCHA if present\n" +
      "  3. Click the submit/remove button\n" +
      "Press Enter after you've submitted the form..."
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page);

    await waitForEnter(
      "\n[Spokeo] STEP 3: Email verification required:\n" +
      "  1. Check your email inbox for a confirmation from Spokeo\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any additional steps on the verification page\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[Spokeo] ✓ Opt-out process completed. Your request has been submitted.");
    console.log("[Spokeo] Note: Removal typically takes 2-5 business days.");
  }
}
