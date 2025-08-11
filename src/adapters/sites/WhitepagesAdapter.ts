import type { Page } from "@playwright/test";
import { BaseAdapter } from "../BaseAdapter.js";
import type { PersonProfile } from "../../types.js";
import { waitForEnter } from "../../utils/human.js";

export class WhitepagesAdapter extends BaseAdapter {
  public name(): string { return "Whitepages"; }

  protected async execute(page: Page, _profile: PersonProfile): Promise<void> {
    await waitForEnter("On Whitepages: locate your listing, open the suppression request, and follow on-screen steps. Solve CAPTCHA if present, then submit.");
    await page.waitForTimeout(4000);
  }
}