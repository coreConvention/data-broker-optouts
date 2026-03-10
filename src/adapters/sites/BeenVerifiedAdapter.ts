import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class BeenVerifiedAdapter extends BaseAdapter {
  public name(): string { return "BeenVerified"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[BeenVerified] Starting opt-out process...");
    console.log("[BeenVerified] Note: This is a multi-step process requiring search and selection.");

    // Auto-fill search form with first/last name
    console.log("[BeenVerified] Attempting to auto-fill search form...");
    const nameParts = profile.fullName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    await this.tryFillField(page, BaseAdapter.FIRST_NAME_SELECTORS, firstName, "First name");
    await this.tryFillField(page, BaseAdapter.LAST_NAME_SELECTORS, lastName, "Last name");
    if (profile.city) {
      await this.tryFillField(page, BaseAdapter.CITY_SELECTORS, profile.city, "City", 1000);
    }
    if (profile.state) {
      await this.tryFillStateField(page, BaseAdapter.STATE_SELECTORS, profile.state);
    }

    await waitForEnter(
      "\n[BeenVerified] STEP 1: Search for your record:\n" +
      "  1. Review the search form (auto-filled if possible)\n" +
      "  2. Fill any missing fields (name, city, state)\n" +
      "  3. Click the search button\n" +
      "  4. Wait for search results to load\n" +
      "Press Enter when search results are displayed..."
    );

    await waitForEnter(
      "\n[BeenVerified] STEP 2: Select your record:\n" +
      "  1. Find your record in the search results\n" +
      "  2. Click on your record to view details\n" +
      "  3. Look for 'Opt Out' or 'Remove this record' option\n" +
      "  4. Click the opt-out link\n" +
      "Press Enter when you're on the opt-out form..."
    );

    console.log("[BeenVerified] Attempting to auto-fill opt-out form...");
    await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email", 2000);

    await waitForEnter(
      "\n[BeenVerified] STEP 3: Complete opt-out request:\n" +
      "  1. Verify your email address is correct\n" +
      "  2. Fill any additional required fields\n" +
      "  3. Solve the CAPTCHA if present\n" +
      "  4. Click the submit or opt-out button\n" +
      "Press Enter after you've submitted the form..."
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page, ["text=/opt.*out.*request/i"]);

    await waitForEnter(
      "\n[BeenVerified] STEP 4: Email verification:\n" +
      "  1. Check your email for a confirmation from BeenVerified\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any final confirmation steps\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[BeenVerified] ✓ Opt-out process completed.");
    console.log("[BeenVerified] Note: Removal can take several days to process.");
    console.log("[BeenVerified] IMPORTANT: You may need to repeat for multiple records.");
  }
}
