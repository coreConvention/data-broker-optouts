import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class MyLifeAdapter extends BaseAdapter {
  public name(): string { return "MyLife"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[MyLife] Starting opt-out process...");
    console.log("[MyLife] Note: Process may vary for CA vs. non-CA residents.");

    // Step 1: Navigate to opt-out page
    await waitForEnter(
      "[MyLife] STEP 1: Initial setup:\n" +
      "  1. You're on the MyLife privacy/CCPA page\n" +
      "  2. Look for 'Do Not Sell My Personal Information' section\n" +
      "  3. There may be different options for CA vs. non-CA residents\n" +
      "  4. Click the appropriate opt-out link or button\n" +
      "Press Enter when you're on the opt-out form..."
    );

    // Step 2: Auto-fill form fields
    console.log("[MyLife] Attempting to auto-fill form fields...");

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
          console.log(`[MyLife] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

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
          console.log(`[MyLife] ✓ Name filled: ${profile.fullName}`);
          break;
        }
      } catch {}
    }

    // Try to fill phone if available
    if (profile.phone) {
      const phoneSelectors = [
        "input[type='tel']",
        "input[name='phone']",
        "input[id*='phone']",
        "input[placeholder*='phone' i]"
      ];

      for (const selector of phoneSelectors) {
        try {
          const phoneInput = page.locator(selector).first();
          if (await phoneInput.isVisible({ timeout: 1500 })) {
            await phoneInput.fill(profile.phone);
            console.log(`[MyLife] ✓ Phone filled: ${profile.phone}`);
            break;
          }
        } catch {}
      }
    }

    // Try to fill city
    if (profile.city) {
      try {
        const cityInput = page.locator("input[name='city'], input[placeholder*='city' i]").first();
        if (await cityInput.isVisible({ timeout: 1000 })) {
          await cityInput.fill(profile.city);
          console.log(`[MyLife] ✓ City filled: ${profile.city}`);
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
          console.log(`[MyLife] ✓ State filled: ${profile.state}`);
        }
      } catch {}
    }

    console.log("[MyLife] Form auto-fill completed.");

    // Step 3: Complete form and submit
    await waitForEnter(
      "\n[MyLife] STEP 2: Complete opt-out request:\n" +
      "  1. Review all form fields and fill any missing information\n" +
      "  2. You may need to search for your profile first\n" +
      "  3. Select which profile(s) to opt out if multiple exist\n" +
      "  4. Complete any CAPTCHA if present\n" +
      "  5. Click the submit button\n" +
      "Press Enter after you've submitted the form..."
    );

    // Wait for submission
    await page.waitForTimeout(3000);

    // Try to detect success
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/request.*received/i",
      "text=/email.*sent/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[MyLife] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[MyLife] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 4: Email verification
    await waitForEnter(
      "\n[MyLife] STEP 3: Email verification:\n" +
      "  1. Check your email for a confirmation from MyLife\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any additional verification steps\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[MyLife] ✓ Opt-out process completed.");
    console.log("[MyLife] Note: Removal timeline varies; can take several weeks.");
    console.log("[MyLife] IMPORTANT: Non-CA residents report mixed success. You may need to follow up.");
  }
}
