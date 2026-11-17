import type { ElementHandle, Locator, Page } from "@playwright/test";
import { BaseAdapter } from "./BaseAdapter.js";
import type { AdapterOutcome, BrokerEntry, PersonProfile } from "../types.js";

/** Words that show a page is about getting a record removed. */
const OPT_OUT_WORDING = /\bopt(?:ing|ed)?[\s-]*out\b|\bremov(?:e|al|ed|ing)\b|\bsuppress(?:ion|ed|ing)?\b|\bdelet(?:e|ion|ed|ing)\b/i;

/**
 * Submit labels that belong to some other form. Taken from what the adapter
 * would have clicked on live pages before issue #25 ("Subscribe Now" on a
 * marketing sign-up form, "Search" on a site search box).
 */
const WRONG_PURPOSE_LABEL = /subscribe|sign\s*-?\s*up|newsletter|search|log\s*-?\s*in|sign\s*-?\s*in/i;

/** How long to wait for a verified entry's submit control to appear. */
const FORM_WAIT_MS = 30_000;

type FieldKey = "name" | "email" | "city" | "state" | "zip" | "address" | "phone";

/**
 * Manifest-driven adapter for brokers without a hand-written adapter.
 *
 * Safe by default (issue #25): sending a person's details to the wrong form is
 * the worst thing this tool can do, so the adapter only types and clicks when
 * the entry is marked `verified` AND the live page still looks like the
 * opt-out form. In every other case it opens the page, types nothing, clicks
 * nothing, and hands over to the person.
 */
export class GenericFormAdapter extends BaseAdapter {
  public constructor(entry: BrokerEntry) {
    super(entry);
  }

  public name(): string { return "generic"; }

  protected async execute(page: Page, profile: PersonProfile): Promise<AdapterOutcome> {
    if (this.entry.verified !== true) {
      return this.handOver("This broker's form automation is unverified, so nothing was typed or clicked for you.");
    }

    const cfg = this.entry.config ?? {};
    const sel = cfg.selectors ?? {};
    const fields: Array<{ key: FieldKey; selector: string; value: string }> = this.fieldsToFill(profile);

    if (!sel.submit || fields.length === 0) {
      return this.handOver("This broker's entry has no form fields or submit button configured, so nothing was typed or clicked for you.");
    }

    // Forms are often rendered late; give the submit control time to appear.
    // If it never does, the scan below finds no form and we hand over.
    try {
      await page.locator(sel.submit).first().waitFor({ state: "visible", timeout: FORM_WAIT_MS });
    } catch { /* handled by the scan below */ }

    if (!(await this.pageMentionsOptOut(page))) {
      return this.handOver("This page does not mention opt-out, removal, suppression or deletion, so nothing was typed or clicked for you.");
    }

    const form: Locator | null = await this.findOptOutForm(page, fields.map(f => f.selector), sel.submit);
    if (!form) {
      return this.handOver("No single form on this page holds both the expected fields and an opt-out submit button, so nothing was typed or clicked for you.");
    }

    // Everything from here on is scoped to that one form, never the whole page.
    const filled: ElementHandle[] = [];
    for (const field of fields) {
      const target: Locator = form.locator(field.selector).first();
      if (field.key === "state") {
        await this.fillStateField(target, field.value);
      } else {
        await target.fill(field.value);
      }
      const handle = await target.elementHandle();
      if (handle) filled.push(handle);
    }

    for (const c of cfg.checkboxes ?? []) {
      const box: Locator = form.locator(c).first();
      if (!(await box.isVisible())) {
        return this.handOver("A required checkbox is not inside the opt-out form. Your details were typed into the form but nothing was submitted.");
      }
      if (!(await box.isChecked())) await box.click();
    }

    if (this.entry.requirements.includes("captcha")
      || this.entry.requirements.includes("id-upload")) {
      await this.ioProvider.waitForConfirmation(`Site: ${this.entry.name}\nIf needed, solve CAPTCHA or upload ID in the browser window.`, { broker: this.entry.name, ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}) });
    }

    // Re-check right before the click: the page may have changed while the
    // person solved a CAPTCHA, and the submit control must still sit in the
    // same <form> as a field we filled and must still not be another form's button.
    const submit: Locator = form.locator(sel.submit).first();
    if (!(await this.isSafeToSubmit(submit, filled))) {
      return this.handOver("The submit button is no longer part of the form that was filled in. Your details were typed into the form but nothing was submitted.");
    }
    await submit.click();

    if (typeof cfg.postSubmitWaitMs === "number" && cfg.postSubmitWaitMs > 0) {
      await page.waitForTimeout(cfg.postSubmitWaitMs);
    }

    if (this.entry.requirements.includes("email-verification")) {
      await this.ioProvider.waitForConfirmation(`Site: ${this.entry.name}\nComplete any email verification (click the link in your inbox). When done, return here.`, { broker: this.entry.name });
    }

    return "submitted";
  }

  /** The configured fields that the profile has a value for, in fill order. */
  private fieldsToFill(profile: PersonProfile): Array<{ key: FieldKey; selector: string; value: string }> {
    const sel = this.entry.config?.selectors ?? {};
    const values: Record<FieldKey, string | null | undefined> = {
      name: profile.fullName,
      email: profile.email,
      city: profile.city,
      state: profile.state,
      zip: profile.zip,
      address: profile.address,
      phone: profile.phone,
    };
    const keys: FieldKey[] = ["name", "email", "city", "state", "zip", "address", "phone"];
    const fields: Array<{ key: FieldKey; selector: string; value: string }> = [];
    for (const key of keys) {
      const selector = sel[key];
      const value = values[key];
      if (selector && value) fields.push({ key, selector, value });
    }
    return fields;
  }

  /**
   * Opens nothing new and touches nothing: tells the person why the opt-out is
   * theirs to finish, and waits for them.
   */
  private async handOver(reason: string): Promise<AdapterOutcome> {
    const lines: string[] = [
      `Site: ${this.entry.name}`,
      reason,
      "1. Find your listing on this site first. If they hold no record of you, there is nothing to remove, and submitting your details would only give them new data.",
      "2. If you are listed, complete the opt-out by hand in the browser window.",
    ];
    if (this.entry.notes) lines.push(`Notes: ${this.entry.notes}`);
    lines.push("Continue here when you are done.");

    this.ioProvider.log("warn", `[${this.name()}] ${this.entry.name}: manual opt-out needed. ${reason}`);
    await this.ioProvider.waitForConfirmation(lines.join("\n"), {
      broker: this.entry.name,
      ...(this.entry.removalUrl ? { url: this.entry.removalUrl } : {}),
    });
    return "manual";
  }

  private async pageMentionsOptOut(page: Page): Promise<boolean> {
    const text: string = `${await page.title()}\n${await page.locator("body").innerText()}`;
    return OPT_OUT_WORDING.test(text);
  }

  /**
   * Finds the one <form> that visibly holds every configured field and a
   * submit control that is not another form's button (newsletter, search,
   * login). Matching per form, instead of taking the first match on the page,
   * is what keeps a loose selector like `input[type='email']` from landing in
   * a marketing sign-up form that happens to come first.
   */
  private async findOptOutForm(page: Page, fieldSelectors: string[], submitSelector: string): Promise<Locator | null> {
    const forms: Locator = page.locator("form");
    const count: number = await forms.count();

    for (let i = 0; i < count; i++) {
      const form: Locator = forms.nth(i);
      const submit: Locator = form.locator(submitSelector).first();
      if (!(await submit.isVisible())) continue;
      if (WRONG_PURPOSE_LABEL.test(await this.controlLabel(submit))) continue;

      let hasEveryField = true;
      for (const selector of fieldSelectors) {
        if (!(await form.locator(selector).first().isVisible())) { hasEveryField = false; break; }
      }
      if (hasEveryField) return form;
    }
    return null;
  }

  /** The text a person would read on a button or submit input. */
  private async controlLabel(control: Locator): Promise<string> {
    return control.evaluate((el: Element) =>
      [el.textContent, el.getAttribute("value"), el.getAttribute("aria-label"), el.getAttribute("title")]
        .filter(Boolean)
        .join(" ")
    );
  }

  private async isSafeToSubmit(submit: Locator, filled: ElementHandle[]): Promise<boolean> {
    if (!(await submit.isVisible())) return false;
    if (WRONG_PURPOSE_LABEL.test(await this.controlLabel(submit))) return false;
    return submit.evaluate(
      (el: Element, fields: Node[]) => {
        const form = el.closest("form");
        return form !== null && fields.some(field => form.contains(field));
      },
      filled
    );
  }

  /**
   * Fills a state field that could be either a <select> dropdown or a text <input>.
   * Tries selectOption by label, then by value (e.g. "CA"), then plain fill.
   */
  private async fillStateField(target: Locator, value: string): Promise<void> {
    try {
      await target.selectOption({ label: value }, { timeout: 2_000 });
    } catch {
      try {
        await target.selectOption({ value }, { timeout: 2_000 });
      } catch {
        await target.fill(value);
      }
    }
  }
}
