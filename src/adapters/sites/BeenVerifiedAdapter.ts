import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class BeenVerifiedAdapter extends BaseAdapter {
  public name(): string { return "BeenVerified"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[BeenVerified] Starting opt-out process...");
    console.log("[BeenVerified] Note: This is a multi-step process requiring search and selection.");

    // Step 1: Search for profile
    console.log("[BeenVerified] Attempting to auto-fill search form...");

    // Try to fill name in search form
    const firstNameSelectors = [
      "input[name='firstName']",
      "input[name='first_name']",
      "input[id*='firstName']",
      "input[placeholder*='first name' i]"
    ];

    const lastNameSelectors = [
      "input[name='lastName']",
      "input[name='last_name']",
      "input[id*='lastName']",
      "input[placeholder*='last name' i]"
    ];

    // Split full name
    const nameParts = profile.fullName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Fill first name
    for (const selector of firstNameSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1500 })) {
          await input.fill(firstName);
          console.log(`[BeenVerified] ✓ First name filled: ${firstName}`);
          break;
        }
      } catch {}
    }

    // Fill last name
    for (const selector of lastNameSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 1500 })) {
          await input.fill(lastName);
          console.log(`[BeenVerified] ✓ Last name filled: ${lastName}`);
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
          console.log(`[BeenVerified] ✓ City filled: ${profile.city}`);
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
          console.log(`[BeenVerified] ✓ State filled: ${profile.state}`);
        }
      } catch {}
    }

    await waitForEnter(
      "\n[BeenVerified] STEP 1: Search for your record:\n" +
      "  1. Review the search form (auto-filled if possible)\n" +
      "  2. Fill any missing fields (name, city, state)\n" +
      "  3. Click the search button\n" +
      "  4. Wait for search results to load\n" +
      "Press Enter when search results are displayed..."
    );

    // Step 2: Select record and navigate to opt-out
    await waitForEnter(
      "\n[BeenVerified] STEP 2: Select your record:\n" +
      "  1. Find your record in the search results\n" +
      "  2. Click on your record to view details\n" +
      "  3. Look for 'Opt Out' or 'Remove this record' option\n" +
      "  4. Click the opt-out link\n" +
      "Press Enter when you're on the opt-out form..."
    );

    // Step 3: Fill opt-out form
    console.log("[BeenVerified] Attempting to auto-fill opt-out form...");

    // Try to fill email
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
          console.log(`[BeenVerified] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

    // Step 4: CAPTCHA and submission
    await waitForEnter(
      "\n[BeenVerified] STEP 3: Complete opt-out request:\n" +
      "  1. Verify your email address is correct\n" +
      "  2. Fill any additional required fields\n" +
      "  3. Solve the CAPTCHA if present\n" +
      "  4. Click the submit or opt-out button\n" +
      "Press Enter after you've submitted the form..."
    );

    // Wait for submission
    await page.waitForTimeout(3000);

    // Try to detect success
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/email.*sent/i",
      "text=/opt.*out.*request/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[BeenVerified] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[BeenVerified] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 5: Email verification
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
