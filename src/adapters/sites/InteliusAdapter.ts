import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class InteliusAdapter extends BaseAdapter {
  public name(): string { return "Intelius"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Intelius] Starting opt-out process...");
    console.log("[Intelius] Note: Intelius is part of the PeopleConnect network.");
    console.log("[Intelius] The suppression page may require account creation.");

    await waitForEnter(
      "[Intelius] STEP 1: Account setup (if needed):\n" +
      "  1. You're on the PeopleConnect suppression portal\n" +
      "  2. If prompted, create an account or log in\n" +
      "  3. You may need to verify your email first\n" +
      "  4. Once logged in, you'll see the suppression dashboard\n" +
      "Press Enter when you're logged in or on the suppression form..."
    );

    console.log("[Intelius] Attempting to auto-fill email field...");
    await this.tryFillField(page, BaseAdapter.EMAIL_SELECTORS, profile.email, "Email", 2000);

    await waitForEnter(
      "\n[Intelius] STEP 2: Search for your records:\n" +
      "  1. Use the search form to find your listings\n" +
      "  2. Enter your name, location, age, or phone number\n" +
      "  3. Click search to find your records\n" +
      "  4. Review the results for your information\n" +
      "Press Enter when you can see your records..."
    );

    await this.tryFillField(page, BaseAdapter.NAME_SELECTORS, profile.fullName, "Name");
    if (profile.city) {
      await this.tryFillField(page, BaseAdapter.CITY_SELECTORS, profile.city, "City", 1000);
    }
    if (profile.state) {
      await this.tryFillStateField(page, BaseAdapter.STATE_SELECTORS, profile.state);
    }

    await waitForEnter(
      "\n[Intelius] STEP 3: Select records to suppress:\n" +
      "  1. Check the box next to each record you want removed\n" +
      "  2. You can select multiple records\n" +
      "  3. Look for 'Submit Suppression Request' or similar button\n" +
      "  4. Click the button to submit your request\n" +
      "Press Enter after you've submitted your suppression request..."
    );

    await page.waitForTimeout(3000);
    await this.detectAndLogSuccess(page, ["text=/suppression.*request/i"]);

    await waitForEnter(
      "\n[Intelius] STEP 4: Email verification:\n" +
      "  1. Check your email for confirmation from PeopleConnect/Intelius\n" +
      "  2. Click any verification links in the email\n" +
      "  3. Complete any additional verification steps\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[Intelius] ✓ Opt-out process completed.");
    console.log("[Intelius] Note: Removal typically takes 7-10 business days.");
    console.log("[Intelius] IMPORTANT: This suppression applies to PeopleConnect network sites.");
  }
}
