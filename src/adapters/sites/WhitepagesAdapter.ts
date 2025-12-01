import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class WhitepagesAdapter extends BaseAdapter {
  public name(): string { return "Whitepages"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    console.log("\n[Whitepages] Starting suppression request process...");
    console.log("[Whitepages] Note: You'll need to manually search for your listing first.");

    // Step 1: User searches for their listing
    await waitForEnter(
      "[Whitepages] STEP 1: Search for your listing:\n" +
      "  1. In the browser, use the Whitepages search to find yourself\n" +
      "  2. Search by name, phone number, or address\n" +
      "  3. Locate your listing(s) in the results\n" +
      "  4. Navigate to the suppression request page\n" +
      "Press Enter when you're on the suppression request form..."
    );

    // Step 2: Auto-fill form fields
    console.log("[Whitepages] Attempting to auto-fill form fields...");

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
          console.log(`[Whitepages] ✓ Name filled: ${profile.fullName}`);
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
          console.log(`[Whitepages] ✓ Email filled: ${profile.email}`);
          break;
        }
      } catch {}
    }

    // Try to fill phone if available
    if (profile.phone) {
      const phoneSelectors = [
        "input[type='tel']",
        "input[name='phone']",
        "input[name='phoneNumber']",
        "input[id*='phone']",
        "input[placeholder*='phone' i]"
      ];

      for (const selector of phoneSelectors) {
        try {
          const phoneInput = page.locator(selector).first();
          if (await phoneInput.isVisible({ timeout: 1500 })) {
            await phoneInput.fill(profile.phone);
            console.log(`[Whitepages] ✓ Phone filled: ${profile.phone}`);
            break;
          }
        } catch {}
      }
    }

    // Try to fill address if available
    if (profile.address) {
      const addressSelectors = [
        "input[name='address']",
        "input[id*='address']",
        "input[placeholder*='address' i]"
      ];

      for (const selector of addressSelectors) {
        try {
          const addressInput = page.locator(selector).first();
          if (await addressInput.isVisible({ timeout: 1500 })) {
            await addressInput.fill(profile.address);
            console.log(`[Whitepages] ✓ Address filled: ${profile.address}`);
            break;
          }
        } catch {}
      }
    }

    // Try to fill city, state, zip if available
    if (profile.city) {
      try {
        const cityInput = page.locator("input[name='city'], input[placeholder*='city' i]").first();
        if (await cityInput.isVisible({ timeout: 1000 })) {
          await cityInput.fill(profile.city);
          console.log(`[Whitepages] ✓ City filled: ${profile.city}`);
        }
      } catch {}
    }

    if (profile.state) {
      try {
        const stateInput = page.locator("select[name='state'], input[name='state']").first();
        if (await stateInput.isVisible({ timeout: 1000 })) {
          await stateInput.selectOption({ label: profile.state }).catch(async () => {
            // If select fails, try filling as text input
            if (profile.state) {
              await stateInput.fill(profile.state);
            }
          });
          console.log(`[Whitepages] ✓ State filled: ${profile.state}`);
        }
      } catch {}
    }

    if (profile.zip) {
      try {
        const zipInput = page.locator("input[name='zip'], input[name='zipcode'], input[placeholder*='zip' i]").first();
        if (await zipInput.isVisible({ timeout: 1000 })) {
          await zipInput.fill(profile.zip);
          console.log(`[Whitepages] ✓ ZIP filled: ${profile.zip}`);
        }
      } catch {}
    }

    console.log("[Whitepages] Form auto-fill completed.");

    // Step 3: Form completion and phone number entry
    await waitForEnter(
      "\n[Whitepages] STEP 2: Complete the suppression request form:\n" +
      "  1. Select a reason for opt-out from the dropdown (e.g., 'I want to keep my information private')\n" +
      "  2. Solve the CAPTCHA if present\n" +
      "  3. Agree to any terms/conditions checkboxes\n" +
      "  4. Enter your phone number for verification\n" +
      "  5. Click 'Call Now to Verify' button\n" +
      "Press Enter AFTER you've clicked the call verification button..."
    );

    // Step 4: Phone verification - CRITICAL STEP
    console.log("\n[Whitepages] ========================================");
    console.log("[Whitepages] 📞 PHONE VERIFICATION IN PROGRESS");
    console.log("[Whitepages] ========================================");
    console.log("[Whitepages] You should receive an automated phone call NOW.");
    console.log("[Whitepages] A verification code is displayed on your screen.");
    console.log("[Whitepages] When you answer the call, enter this code using your phone keypad.");

    await waitForEnter(
      "\n[Whitepages] STEP 3: Complete phone verification:\n" +
      "  1. Answer the automated phone call from Whitepages\n" +
      "  2. Look at the verification code displayed on your screen\n" +
      "  3. Enter the code using your phone's keypad\n" +
      "  4. Wait for the confirmation message\n" +
      "Press Enter AFTER you've completed the phone verification..."
    );

    // Wait for verification to process
    await page.waitForTimeout(3000);

    // Try to detect success message
    const successIndicators = [
      "text=/success/i",
      "text=/submitted/i",
      "text=/confirmation/i",
      "text=/received/i",
      "text=/thank you/i",
      "text=/request.*processed/i",
      "text=/opt.*out.*complete/i",
      "text=/removed/i"
    ];

    let successDetected = false;
    for (const indicator of successIndicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          console.log("[Whitepages] ✓ Success message detected!");
          successDetected = true;
          break;
        }
      } catch {}
    }

    if (!successDetected) {
      console.log("[Whitepages] ⚠ Could not detect success message. Please verify manually.");
    }

    // Step 5: Final confirmation
    await waitForEnter(
      "\n[Whitepages] STEP 4: Final confirmation:\n" +
      "  1. Verify you see a success/confirmation message on screen\n" +
      "  2. Check your email for any confirmation (optional for Whitepages)\n" +
      "Press Enter when you've confirmed the opt-out was successful..."
    );

    console.log("[Whitepages] ✓ Suppression request completed.");
    console.log("[Whitepages] Note: Removal typically takes 24-48 hours.");
  }
}