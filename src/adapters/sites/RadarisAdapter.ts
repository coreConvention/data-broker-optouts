import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class RadarisAdapter extends BaseAdapter {
  public name(): string { return "Radaris"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Radaris] Starting opt-out process...");
    console.log("[Radaris] Note: You need to find your profile first at radaris.com");

    await waitForEnter(
      "[Radaris] STEP 1: Search for your profile:\n" +
      "  1. Go to radaris.com and search for your name and location\n" +
      "  2. Find your profile in the search results\n" +
      "  3. Click 'View Profile' to see your full listing\n" +
      "  4. Note the profile URL or details\n" +
      "  5. Navigate back to the privacy control page (already loaded)\n" +
      "Press Enter when you're ready to fill the opt-out form..."
    );

    await this.autoFillProfile(page, profile);
    console.log("[Radaris] Form fields filled. You may need to provide additional details.");

    await waitForEnter(
      "\n[Radaris] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify all form fields are correct\n" +
      "  2. Provide profile URL or additional identifying information\n" +
      "  3. Select which profile(s) to remove if prompted\n" +
      "  4. Complete any CAPTCHA if present\n" +
      "  5. Click the submit button\n" +
      "Press Enter after you've submitted the form..."
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page, ["text=/verification/i"]);

    await waitForEnter(
      "\n[Radaris] STEP 3: Email verification required:\n" +
      "  1. Check your email for a verification message from Radaris\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Confirm your opt-out request on the verification page\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[Radaris] ✓ Opt-out process completed.");
    console.log("[Radaris] Note: Removal typically takes 24-48 hours after verification.");
    console.log("[Radaris] IMPORTANT: You may need to repeat this process for multiple profiles.");
  }
}
