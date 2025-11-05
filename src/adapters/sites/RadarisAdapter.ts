import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class RadarisAdapter extends BaseAdapter {
  public name(): string { return "Radaris"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Radaris] Starting opt-out process...");
    console.log("[Radaris] Note: You need to find your profile first at radaris.com");

    // Step 1: User searches for their profile
    await waitForEnter(
      "[Radaris] STEP 1: Search for your profile:\n" +
      "  1. Go to radaris.com and search for your name and location\n" +
      "  2. Find your profile in the search results\n" +
      "  3. Click 'View Profile' to see your full listing\n" +
      "  4. Note the profile URL or details\n" +
      "  5. Navigate back to the privacy control page (already loaded)\n" +
      "Press Enter when you're ready to fill the opt-out form..."
    );

    // Step 2: Auto-fill form fields
    console.log("[Radaris] Attempting to auto-fill form fields...");

    // Try to fill name
    const nameSelectors = [
      "input[name='name']",
      "input[name='fullName']",
      "input[name='full_name']",
      "input[id*='name']",
      "input[placeholder*='name' i]"
    ];

    for (const selector of nameSelectors) {
      try {
        const nameInput = page.locator(selector).first();
        if (await nameInput.isVisible({ timeout: 1500 })) {
          await nameInput.fill(profile.fullName);
          console.log(`[Radaris] ✓ Name filled: ${profile.fullName}`);
          break;
        }
      } catch {}
    }

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
        if (await emailInput.isVisible({ timeout: 1500 })) {
          await emailInput.fill(profile.email);
          console.log(`[Radaris] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

    // Try to fill city if available
    if (profile.city) {
      try {
        const cityInput = page.locator("input[name='city'], input[placeholder*='city' i]").first();
        if (await cityInput.isVisible({ timeout: 1000 })) {
          await cityInput.fill(profile.city);
          console.log(`[Radaris] ✓ City filled: ${profile.city}`);
        }
      } catch {}
    }

    // Try to fill state if available
    if (profile.state) {
      try {
        const stateInput = page.locator("select[name='state'], input[name='state']").first();
        if (await stateInput.isVisible({ timeout: 1000 })) {
          await stateInput.selectOption({ label: profile.state }).catch(async () => {
            if (profile.state) {
              await stateInput.fill(profile.state);
            }
          });
          console.log(`[Radaris] ✓ State filled: ${profile.state}`);
        }
      } catch {}
    }

    console.log("[Radaris] Form fields filled. You may need to provide additional details.");

    // Step 3: Manual completion
    await waitForEnter(
      "\n[Radaris] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify all form fields are correct\n" +
      "  2. Provide profile URL or additional identifying information\n" +
      "  3. Select which profile(s) to remove if prompted\n" +
      "  4. Complete any CAPTCHA if present\n" +
      "  5. Click the submit button\n" +
      "Press Enter after you've submitted the form..."
    );

    // Wait for submission
    await page.waitForTimeout(3000);

    // Try to detect success message
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/email.*sent/i",
      "text=/verification/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[Radaris] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[Radaris] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 4: Email verification
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
