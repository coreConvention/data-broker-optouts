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

    // Step 1: Check if login/signup is needed
    await waitForEnter(
      "[Intelius] STEP 1: Account setup (if needed):\n" +
      "  1. You're on the PeopleConnect suppression portal\n" +
      "  2. If prompted, create an account or log in\n" +
      "  3. You may need to verify your email first\n" +
      "  4. Once logged in, you'll see the suppression dashboard\n" +
      "Press Enter when you're logged in or on the suppression form..."
    );

    // Step 2: Auto-fill email if on login/signup page
    console.log("[Intelius] Attempting to auto-fill email field...");

    const emailSelectors = [
      "input[type='email']",
      "input[name='email']",
      "input[id*='email']",
      "input[placeholder*='email' i]"
    ];

    for (const selector of emailSelectors) {
      try {
        const emailInput = page.locator(selector).first();
        if (await emailInput.isVisible({ timeout: 2000 })) {
          await emailInput.fill(profile.email);
          console.log(`[Intelius] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

    // Step 3: Search for records
    await waitForEnter(
      "\n[Intelius] STEP 2: Search for your records:\n" +
      "  1. Use the search form to find your listings\n" +
      "  2. Enter your name, location, age, or phone number\n" +
      "  3. Click search to find your records\n" +
      "  4. Review the results for your information\n" +
      "Press Enter when you can see your records..."
    );

    // Try to help with name search
    const nameSelectors = [
      "input[name='name']",
      "input[name='fullName']",
      "input[placeholder*='name' i]"
    ];

    for (const selector of nameSelectors) {
      try {
        const nameInput = page.locator(selector).first();
        if (await nameInput.isVisible({ timeout: 1500 })) {
          await nameInput.fill(profile.fullName);
          console.log(`[Intelius] ✓ Name filled: ${profile.fullName}`);
          break;
        }
      } catch {}
    }

    // Try to fill city
    if (profile.city) {
      try {
        const cityInput = page.locator("input[name='city'], input[placeholder*='city' i]").first();
        if (await cityInput.isVisible({ timeout: 1000 })) {
          await cityInput.fill(profile.city);
          console.log(`[Intelius] ✓ City filled: ${profile.city}`);
        }
      } catch {}
    }

    // Try to fill state
    if (profile.state) {
      try {
        const stateInput = page.locator("select[name='state'], input[name='state']").first();
        if (await stateInput.isVisible({ timeout: 1000 })) {
          await stateInput.selectOption({ label: profile.state }).catch(async () => {
            if (profile.state) {
              await stateInput.fill(profile.state);
            }
          });
          console.log(`[Intelius] ✓ State filled: ${profile.state}`);
        }
      } catch {}
    }

    // Step 4: Select records to remove
    await waitForEnter(
      "\n[Intelius] STEP 3: Select records to suppress:\n" +
      "  1. Check the box next to each record you want removed\n" +
      "  2. You can select multiple records\n" +
      "  3. Look for 'Submit Suppression Request' or similar button\n" +
      "  4. Click the button to submit your request\n" +
      "Press Enter after you've submitted your suppression request..."
    );

    // Wait for submission
    await page.waitForTimeout(3000);

    // Try to detect success
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/suppression.*request/i",
      "text=/confirmation/i",
      "text=/email.*sent/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[Intelius] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[Intelius] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 5: Email verification
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
