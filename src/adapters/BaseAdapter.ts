import type { BrowserContext, Locator, Page } from "@playwright/test";
import type { AdapterOutcome, BrokerEntry, PersonProfile, IOProvider, ExecutionContext } from "../types.js";
import type { EvidenceStore } from "../services/EvidenceStore.js";

export abstract class BaseAdapter {
  protected readonly entry: BrokerEntry;
  protected ioProvider: IOProvider = {
    promptUser: async () => "",
    waitForConfirmation: async () => {},
    log: (_level, msg) => console.log(msg),
    openExternal: async () => {},
    shouldOpenInBrowser: () => false,
  };
  /** Where an error screenshot goes. Set from the execution context; none is taken without it. */
  private evidence: EvidenceStore | undefined;

  public constructor(entry: BrokerEntry) {
    this.entry = entry;
  }

  public abstract name(): string;

  /**
   * Opens the broker's page and runs the adapter on it.
   *
   * @returns "submitted" when the adapter sent the opt-out itself, "manual"
   * when it left the opt-out to the person. The orchestrator records the
   * broker's status from this, so an adapter that did not submit must say so.
   */
  public async run(context: BrowserContext, profile: PersonProfile, execContext?: ExecutionContext): Promise<AdapterOutcome> {
    if (execContext) {
      this.ioProvider = execContext.ioProvider;
      this.evidence = execContext.evidence;
    }
    const page = await context.newPage();
    try {
      if (!this.entry.removalUrl) throw new Error("No removalUrl provided.");

      // Navigate with retry logic
      await this.retryOperation(
        async () => {
          await page.goto(this.entry.removalUrl!, { waitUntil: "load", timeout: 60_000 });
        },
        3,
        2000,
        `navigating to ${this.entry.removalUrl}`
      );

      return (await this.execute(page, profile)) ?? "submitted";
    } catch (error) {
      // Capture screenshot on error
      await this.captureErrorScreenshot(page);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Site-specific steps. Returning nothing means "submitted", which is what
   * the hand-written site adapters do; return "manual" when nothing was sent.
   */
  protected abstract execute(page: Page, profile: PersonProfile): Promise<AdapterOutcome | void>;

  protected async ensureVisible(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
  }

  /**
   * Retry an operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 2000,
    operationName: string = "operation"
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const backoffDelay = delayMs * Math.pow(2, attempt - 1);
          this.ioProvider.log("warn", `[${this.name()}] Retry ${attempt}/${maxRetries} for ${operationName} failed. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    this.ioProvider.log("error", `[${this.name()}] All ${maxRetries} attempts failed for ${operationName}`);
    throw lastError;
  }

  /**
   * Capture a screenshot of the page an error happened on, for debugging.
   *
   * It goes to the evidence folder with every other image that can show the
   * person's details (design plan section 5.3), never to `./logs`. The log
   * line gives the path inside the data folder and nothing from the error.
   */
  protected async captureErrorScreenshot(page: Page): Promise<void> {
    if (!this.evidence) {
      return;
    }
    const saved: string | null = await this.evidence.capture(page, this.entry.name, "error");
    if (saved) {
      this.ioProvider.log("info", `[${this.name()}] Screenshot saved in your data folder: ${saved}`);
    } else {
      this.ioProvider.log("warn", `[${this.name()}] Could not capture screenshot`);
    }
  }

  /**
   * Try to detect success indicators on the page
   */
  protected async detectSuccess(page: Page, indicators: string[]): Promise<boolean> {
    for (const indicator of indicators) {
      try {
        if (await page.locator(indicator).isVisible({ timeout: 2000 })) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  /** Common success indicator selectors used across most adapters */
  protected static readonly DEFAULT_SUCCESS_INDICATORS = [
    "text=/success/i",
    "text=/submitted/i",
    "text=/confirmation/i",
    "text=/email.*sent/i",
    "text=/request.*received/i",
    "text=/thank you/i",
    "text=/opt.*out.*complete/i",
    "text=/removed/i",
    "text=/request.*processed/i",
  ];

  /**
   * Detect success using default indicators and log the result.
   * Returns true if any success indicator was found.
   */
  protected async detectAndLogSuccess(page: Page, extraIndicators: string[] = []): Promise<boolean> {
    const indicators = [...BaseAdapter.DEFAULT_SUCCESS_INDICATORS, ...extraIndicators];
    const detected = await this.detectSuccess(page, indicators);
    if (detected) {
      this.ioProvider.log("success", `[${this.name()}] Success message detected!`);
    } else {
      this.ioProvider.log("warn", `[${this.name()}] Could not detect success message. Please verify manually.`);
    }
    return detected;
  }

  /**
   * Submit labels that belong to some other form. Taken from what the generic
   * adapter would have clicked on live pages before issue #25 ("Subscribe Now"
   * on a marketing sign-up form) plus the login boxes of issue #29.
   */
  protected static readonly OTHER_PURPOSE_LABEL = /subscribe|sign\s*-?\s*up|newsletter|log\s*-?\s*in|sign\s*-?\s*in/i;

  /** A site search box is another form too, unless the step is itself a search. */
  protected static readonly SEARCH_LABEL = /search/i;

  /** Controls that submit the form they sit in. */
  protected static readonly SUBMIT_CONTROLS =
    "button:not([type='button']):not([type='reset']), input[type='submit'], input[type='image']";

  /** The text a person would read on a button or submit input. */
  protected async controlLabel(control: Locator): Promise<string> {
    return control.evaluate((el: Element) =>
      [el.textContent, el.getAttribute("value"), el.getAttribute("aria-label"), el.getAttribute("title")]
        .filter(Boolean)
        .join(" ")
    );
  }

  /** True when the label reads like a newsletter, login or (unless allowed) search button. */
  protected isWrongPurposeLabel(label: string, allowSearchForm: boolean = false): boolean {
    return BaseAdapter.OTHER_PURPOSE_LABEL.test(label)
      || (!allowSearchForm && BaseAdapter.SEARCH_LABEL.test(label));
  }

  /**
   * Finds the <form>s that could be the one the person's details belong in.
   *
   * Matching per form, instead of taking the first match on the page, is what
   * keeps a loose selector like `input[type='email']` from landing in a
   * marketing sign-up or login box that happens to come first (issues #25, #29).
   * A form qualifies when:
   * - it has a visible submit control, and none of its visible submit controls
   *   is another form's button (newsletter, login, search);
   * - it has no visible password field (a login or sign-up box);
   * - it visibly holds the wanted fields: all of them, or at least one.
   *
   * Each wanted field is a list of alternative selectors; any one may match.
   */
  protected async findCandidateForms(page: Page, fields: readonly (readonly string[])[], options: FormMatchOptions = {}): Promise<Locator[]> {
    const submitSelector: string = options.submitSelector ?? BaseAdapter.SUBMIT_CONTROLS;
    const forms: Locator = page.locator("form");
    const count: number = await forms.count();
    const candidates: Locator[] = [];

    for (let i = 0; i < count; i++) {
      const form: Locator = forms.nth(i);
      if (!(await this.hasOnlyRightPurposeSubmits(form, submitSelector, options.allowSearchForm === true))) continue;
      if (await form.locator("input[type='password']").first().isVisible()) continue;

      let held = 0;
      for (const alternatives of fields) {
        if ((await this.firstVisible(form, alternatives)) !== null) held++;
      }
      const holdsFields: boolean = options.requireEveryField === true ? held === fields.length : held > 0;
      if (fields.length > 0 && holdsFields) candidates.push(form);
    }
    return candidates;
  }

  private async hasOnlyRightPurposeSubmits(form: Locator, submitSelector: string, allowSearchForm: boolean): Promise<boolean> {
    const submits: Locator = form.locator(submitSelector);
    const count: number = await submits.count();
    let visible = 0;
    for (let i = 0; i < count; i++) {
      const submit: Locator = submits.nth(i);
      if (!(await submit.isVisible())) continue;
      if (this.isWrongPurposeLabel(await this.controlLabel(submit), allowSearchForm)) return false;
      visible++;
    }
    return visible > 0;
  }

  /** The first visible element inside `scope` matching any of the selectors, in order. */
  private async firstVisible(scope: Locator, selectors: readonly string[]): Promise<Locator | null> {
    for (const selector of selectors) {
      try {
        const locator: Locator = scope.locator(selector).first();
        if (await locator.isVisible()) return locator;
      } catch { /* an invalid selector matches nothing */ }
    }
    return null;
  }

  /**
   * The one form a site adapter may type into, or null. Two or more candidate
   * forms is as bad as none: there is no telling which is the opt-out form, so
   * the fields are left to the person.
   */
  private async findFillForm(page: Page, fields: readonly (readonly string[])[], options: FillOptions): Promise<Locator | null> {
    const candidates: Locator[] = await this.findCandidateForms(page, fields, options);
    return candidates.length === 1 ? candidates[0]! : null;
  }

  /**
   * Says what was left for the person. Never includes the value: log lines go
   * to the terminal and the desktop app's log view (issue #29).
   */
  private logLeftToPerson(what: string): void {
    this.ioProvider.log("warn", `[${this.name()}] ${what}: no single opt-out form on this page holds it, so nothing was typed. Please fill it in yourself.`);
  }

  private async fillIn(form: Locator, selectors: readonly string[], value: string, fieldLabel: string): Promise<boolean> {
    const target: Locator | null = await this.firstVisible(form, selectors);
    if (!target) return false;
    try {
      await target.fill(value);
    } catch {
      return false;
    }
    this.ioProvider.log("info", `[${this.name()}] ${fieldLabel} filled`);
    return true;
  }

  /** Fills a state field that could be a <select> or a text <input>. */
  private async fillInState(form: Locator, selectors: readonly string[], value: string): Promise<boolean> {
    const target: Locator | null = await this.firstVisible(form, selectors);
    if (!target) return false;
    try {
      await target.selectOption({ label: value }, { timeout: 2_000 });
    } catch {
      try {
        await target.selectOption({ value }, { timeout: 2_000 });
      } catch {
        try {
          await target.fill(value);
        } catch {
          return false;
        }
      }
    }
    this.ioProvider.log("info", `[${this.name()}] State filled`);
    return true;
  }

  /**
   * Try to fill a field by probing multiple selectors in order, inside the one
   * form on the page that could be the opt-out form. Types nothing when there
   * is no such form. Returns true if a field was filled.
   */
  protected async tryFillField(
    page: Page,
    selectors: string[],
    value: string,
    fieldLabel: string,
    options: FillOptions = {}
  ): Promise<boolean> {
    const form: Locator | null = await this.findFillForm(page, [selectors], options);
    if (!form) {
      this.logLeftToPerson(fieldLabel);
      return false;
    }
    return this.fillIn(form, selectors, value, fieldLabel);
  }

  /**
   * Try to fill a state field that could be a <select> or text <input>, with
   * the same one-form rule as tryFillField.
   */
  protected async tryFillStateField(
    page: Page,
    selectors: string[],
    value: string,
    options: FillOptions = {}
  ): Promise<boolean> {
    const form: Locator | null = await this.findFillForm(page, [selectors], options);
    if (!form) {
      this.logLeftToPerson("State");
      return false;
    }
    return this.fillInState(form, selectors, value);
  }

  /**
   * Try to tick a checkbox (for example "I agree"), with the same one-form
   * rule as tryFillField, so a marketing-consent box elsewhere stays unticked.
   */
  protected async tryCheckBox(page: Page, selectors: string[], boxLabel: string): Promise<boolean> {
    const form: Locator | null = await this.findFillForm(page, [selectors], {});
    if (!form) {
      this.logLeftToPerson(boxLabel);
      return false;
    }
    const box: Locator | null = await this.firstVisible(form, selectors);
    if (!box) return false;
    try {
      if (!(await box.isChecked())) await box.check();
    } catch {
      return false;
    }
    this.ioProvider.log("info", `[${this.name()}] ${boxLabel} checked`);
    return true;
  }

  /** Common selectors for email fields */
  protected static readonly EMAIL_SELECTORS = [
    "input[type='email']",
    "input[name='email']",
    "input[id*='email']",
    "input[placeholder*='email' i]",
  ];

  /** Common selectors for full name fields */
  protected static readonly NAME_SELECTORS = [
    "input[name='name']",
    "input[name='fullName']",
    "input[name='full_name']",
    "input[id*='name']",
    "input[placeholder*='name' i]",
  ];

  /** Common selectors for phone fields */
  protected static readonly PHONE_SELECTORS = [
    "input[type='tel']",
    "input[name='phone']",
    "input[name='phoneNumber']",
    "input[id*='phone']",
    "input[placeholder*='phone' i]",
  ];

  /** Common selectors for address fields */
  protected static readonly ADDRESS_SELECTORS = [
    "input[name='address']",
    "input[id*='address']",
    "input[placeholder*='address' i]",
  ];

  /** Common selectors for city fields */
  protected static readonly CITY_SELECTORS = [
    "input[name='city']",
    "input[placeholder*='city' i]",
  ];

  /** Common selectors for state fields */
  protected static readonly STATE_SELECTORS = [
    "select[name='state']",
    "input[name='state']",
  ];

  /** Common selectors for zip fields */
  protected static readonly ZIP_SELECTORS = [
    "input[name='zip']",
    "input[name='zipcode']",
    "input[placeholder*='zip' i]",
  ];

  /** Common selectors for first name fields */
  protected static readonly FIRST_NAME_SELECTORS = [
    "input[name='firstName']",
    "input[name='first_name']",
    "input[id*='firstName']",
    "input[placeholder*='first name' i]",
  ];

  /** Common selectors for last name fields */
  protected static readonly LAST_NAME_SELECTORS = [
    "input[name='lastName']",
    "input[name='last_name']",
    "input[id*='lastName']",
    "input[placeholder*='last name' i]",
  ];

  /**
   * Auto-fill common profile fields: email, name, phone, address, city, state
   * and zip. All of them go into ONE form, the single form on the page that
   * could be the opt-out form; when there is no such form nothing is typed.
   */
  protected async autoFillProfile(page: Page, profile: PersonProfile): Promise<void> {
    this.ioProvider.log("info", `[${this.name()}] Attempting to auto-fill form fields...`);

    const wanted: Array<{ label: string; selectors: string[]; value: string | null | undefined }> = [
      { label: "Email", selectors: BaseAdapter.EMAIL_SELECTORS, value: profile.email },
      { label: "Name", selectors: BaseAdapter.NAME_SELECTORS, value: profile.fullName },
      { label: "Phone", selectors: BaseAdapter.PHONE_SELECTORS, value: profile.phone },
      { label: "Address", selectors: BaseAdapter.ADDRESS_SELECTORS, value: profile.address },
      { label: "City", selectors: BaseAdapter.CITY_SELECTORS, value: profile.city },
      { label: "State", selectors: BaseAdapter.STATE_SELECTORS, value: profile.state },
      { label: "ZIP", selectors: BaseAdapter.ZIP_SELECTORS, value: profile.zip },
    ];
    const fields = wanted.filter((f): f is { label: string; selectors: string[]; value: string } => Boolean(f.value));

    const form: Locator | null = await this.findFillForm(page, fields.map(f => f.selectors), {});
    if (!form) {
      this.logLeftToPerson("Your details");
      return;
    }

    for (const field of fields) {
      if (field.label === "State") {
        await this.fillInState(form, field.selectors, field.value);
      } else {
        await this.fillIn(form, field.selectors, field.value, field.label);
      }
    }
  }
}

/** How BaseAdapter decides which forms could hold the person's details. */
export interface FormMatchOptions {
  /** Selector for the form's submit control. Defaults to any submit control. */
  submitSelector?: string;
  /** Require every wanted field in the form, not just one of them. */
  requireEveryField?: boolean;
  /**
   * Accept a form whose button says "Search". Only for steps where the person
   * is looking up their own record in the broker's search form.
   */
  allowSearchForm?: boolean;
}

/** What a site adapter may relax when it auto-fills a field. */
export type FillOptions = Pick<FormMatchOptions, "allowSearchForm">;
