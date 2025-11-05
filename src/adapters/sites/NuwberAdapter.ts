import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class NuwberAdapter extends BaseAdapter {
  public name(): string { return "Nuwber"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Nuwber] Starting opt-out process...");
    console.log("[Nuwber] Note: You need to search for your profile first at nuwber.com");

    // Step 1: User searches for their profile
    await waitForEnter(
      "[Nuwber] STEP 1: Search for your profile:\n" +
      "  1. Search for your name and location at nuwber.com\n" +
      "  2. Find your profile in the search results\n" +
      "  3. Click 'View Details' to open your profile\n" +
      "  4. Scroll to bottom and click 'Remove My Info' or use the removal link\n" +
      "Press Enter when you're on the opt-out page..."
    );

    // Step 2: Fill form fields
    console.log("[Nuwber] Attempting to auto-fill form fields...");

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
          console.log(`[Nuwber] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

    // Check for agreement checkbox
    const checkboxSelectors = [
      "input[type='checkbox'][name*='agree']",
      "input[type='checkbox'][name*='confirm']",
      "input[type='checkbox'][id*='agree']"
    ];

    for (const selector of checkboxSelectors) {
      try {
        const checkbox = page.locator(selector).first();
        if (await checkbox.isVisible({ timeout: 1500 })) {
          const isChecked = await checkbox.isChecked();
          if (!isChecked) {
            await checkbox.check();
            console.log("[Nuwber] ✓ Agreement checkbox checked");
          }
          break;
        }
      } catch {}
    }

    // Step 3: CAPTCHA and submission
    await waitForEnter(
      "\n[Nuwber] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify the email address is correct\n" +
      "  2. Check any required agreement checkboxes\n" +
      "  3. Solve the CAPTCHA if present\n" +
      "  4. Click the 'Opt Out' or 'Remove' button\n" +
      "Press Enter after you've clicked the submit button..."
    );

    // Wait for submission
    await page.waitForTimeout(3000);

    // Try to detect success message
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/email.*sent/i",
      "text=/check.*email/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[Nuwber] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[Nuwber] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 4: Email verification
    await waitForEnter(
      "\n[Nuwber] STEP 3: Email verification required:\n" +
      "  1. Check your email inbox for a message from Nuwber\n" +
      "  2. Click the verification link in the email\n" +
      "  3. Complete any final steps on the verification page\n" +
      "Press Enter when you've completed email verification..."
    );

    console.log("[Nuwber] ✓ Opt-out process completed.");
    console.log("[Nuwber] Note: Removal typically takes 24 hours after email verification.");
  }
}
