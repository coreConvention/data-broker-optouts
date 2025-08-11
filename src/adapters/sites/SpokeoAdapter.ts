import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class SpokeoAdapter extends BaseAdapter {
  public name(): string { return "Spokeo"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<void> {
    await waitForEnter("On Spokeo, search/select your listing(s) to remove. Then proceed to the form page.");
    const emailSel = "input[type='email'], input[name='email']";
    try {
      const email = page.locator(emailSel).first();
      if (await email.isVisible({ timeout: 2000 })) {
        await email.fill(profile.email);
      }
    } catch {}
    await waitForEnter("Solve any CAPTCHA on Spokeo. If email verification is required, submit and then verify via email.");
    const submitSel = "button[type='submit'], button:has-text('Remove'), input[type='submit']";
    try {
      const btn = page.locator(submitSel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
      }
    } catch {}
    await page.waitForTimeout(4000);
    await waitForEnter("If an email confirmation was sent, complete it now. Press Enter when done.");
  }
}