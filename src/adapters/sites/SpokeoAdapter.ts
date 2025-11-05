import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class SpokeoAdapter extends BaseAdapter {
  public name(): string { return "Spokeo"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Spokeo] Starting opt-out process...");
    console.log("[Spokeo] Note: You'll need to manually search for and select your listing(s).");

    // Step 1: User searches for their listing
    await waitForEnter(
      "[Spokeo] STEP 1: In the browser window:\n" +
      "  1. Search for your name/location on Spokeo\n" +
      "  2. Find your listing(s) in the results\n" +
      "  3. Click on the listing to view details\n" +
      "  4. Look for 'Remove this record' or 'Opt out' link\n" +
      "  5. Navigate to the opt-out form\n" +
      "Press Enter when you're on the opt-out form page..."
    );

    // Step 2: Fill in email field automatically
    console.log("[Spokeo] Attempting to auto-fill email field...");
    const emailSelectors = [
      "input[type='email']",
      "input[name='email']",
      "input[id*='email']",
      "input[placeholder*='email' i]"
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      try {
        const emailInput = page.locator(selector).first();
        if (await emailInput.isVisible({ timeout: 2000 })) {
          await emailInput.fill(profile.email);
          console.log(`[Spokeo] ✓ Email filled: ${profile.email}`);
          emailFilled = true;
          break;
        }
      } catch {}
    }

    if (!emailFilled) {
      console.log("[Spokeo] ⚠ Could not auto-fill email. You may need to enter it manually.");
    }

    // Try to fill name if field exists
    const nameSelectors = [
      "input[name='name']",
      "input[name='fullName']",
      "input[placeholder*='name' i]"
    ];

    for (const selector of nameSelectors) {
      try {
        const nameInput = page.locator(selector).first();
        if (await nameInput.isVisible({ timeout: 1000 })) {
          await nameInput.fill(profile.fullName);
          console.log(`[Spokeo] ✓ Name filled: ${profile.fullName}`);
          break;
        }
      } catch {}
    }

    // Step 3: CAPTCHA and submission
    await waitForEnter(
      "\n[Spokeo] STEP 2: Complete the opt-out request:\n" +
      "  1. Verify all form fields are filled correctly\n" +
      "  2. Solve the CAPTCHA if present\n" +
      "  3. Click the submit/remove button\n" +
      "Press Enter after you've submitted the form..."
    );

    // Wait for submission to process
    await page.waitForTimeout(3000);

    // Try to detect success message
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/email.*sent/i",
      "text=/request.*received/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[Spokeo] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[Spokeo] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 4: Email verification
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