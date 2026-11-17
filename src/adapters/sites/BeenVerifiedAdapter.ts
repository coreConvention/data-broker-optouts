import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";


export class BeenVerifiedAdapter extends BaseAdapter {
  public name(): string { return "BeenVerified"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", "\n[BeenVerified] Starting opt-out process...");
    this.ioProvider.log("info", "[BeenVerified] Note: This is a multi-step process requiring search and selection.");

    // Auto-fill search form with first/last name
    this.ioProvider.log("info", "[BeenVerified] Attempting to auto-fill search form...");
    const nameParts = profile.fullName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // This step fills the broker's own record search, so a "Search" button is expected.
    const searchStep = { allowSearchForm: true };
    await this.tryFillField(page, BaseAdapter.FIRST_NAME_SELECTORS, firstName, "First name", searchStep);
    await this.tryFillField(page, BaseAdapter.LAST_NAME_SELECTORS, lastName, "Last name", searchStep);
    if (profile.city) {
      await this.tryFillField(page, BaseAdapter.CITY_SELECTORS, profile.city, "City", searchStep);
    }
    if (profile.state) {
      await this.tryFillStateField(page, BaseAdapter.STATE_SELECTORS, profile.state, searchStep);
    }

    await this.ioProvider.waitForConfirmation(
      "\n[BeenVerified] STEP 1: Search for your record:\n" +
      "  1. Review the search form (auto-filled if possible)\n" +
      "  2. Fill any missing fields (name, city, state)\n" +
      "  3. Click the search button\n" +
      "  4. Wait for search results to load\n" +
      "Press Enter when search results are displayed...",
      { broker: this.entry.name, ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}) }
    );

    await this.ioProvider.waitForConfirmation(
      "\n[BeenVerified] STEP 2: Select your record:\n" +
      "  1. Find your record in the search results\n" +
      "  2. Click on your record to view details\n" +
      "  3. Look for 'Opt Out' or 'Remove this record' option\n" +
      "  4. Click the opt-out link\n" +
      "Press Enter when you're on the opt-out form...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("info", "[BeenVerified] Attempting to auto-fill opt-out form...");
    await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email");

    await this.ioProvider.waitForConfirmation(
      "\n[BeenVerified] STEP 3: Complete opt-out request:\n" +
      "  1. Verify your email address is correct\n" +
      "  2. Fill any additional required fields\n" +
      "  3. Solve the CAPTCHA if present\n" +
      "  4. Click the submit or opt-out button\n" +
      "Press Enter after you've submitted the form...",
      { broker: this.entry.name }
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page, ["text=/opt.*out.*request/i"]);

    await this.ioProvider.waitForConfirmation(
      "\n[BeenVerified] STEP 4: Email verification:\n" +
      "  1. Check your email for a confirmation from BeenVerified\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any final confirmation steps\n" +
      "Press Enter when you've completed email verification...",
      { broker: this.entry.name }
    );

    this.ioProvider.log("success", "[BeenVerified] Opt-out process completed.");
    this.ioProvider.log("info", "[BeenVerified] Note: Removal can take several days to process.");
    this.ioProvider.log("warn", "[BeenVerified] IMPORTANT: You may need to repeat for multiple records.");
  }
}
