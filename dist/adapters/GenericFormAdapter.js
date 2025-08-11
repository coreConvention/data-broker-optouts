import { BaseAdapter } from "./BaseAdapter.js";
import { waitForEnter } from "../utils/human.js";
export class GenericFormAdapter extends BaseAdapter {
    constructor(entry) {
        super(entry);
    }
    name() { return "generic"; }
    async execute(page, profile) {
        const cfg = this.entry.config ?? {};
        const sel = cfg.selectors ?? {};
        if (sel.name) {
            await this.ensureVisible(page, sel.name);
            await page.fill(sel.name, profile.fullName);
        }
        if (sel.email) {
            await this.ensureVisible(page, sel.email);
            await page.fill(sel.email, profile.email);
        }
        if (sel.city && profile.city) {
            await this.ensureVisible(page, sel.city);
            await page.fill(sel.city, profile.city);
        }
        if (sel.state && profile.state) {
            await this.ensureVisible(page, sel.state);
            await page.selectOption(sel.state, { label: profile.state });
        }
        if (sel.zip && profile.zip) {
            await this.ensureVisible(page, sel.zip);
            await page.fill(sel.zip, profile.zip);
        }
        if (sel.address && profile.address) {
            await this.ensureVisible(page, sel.address);
            await page.fill(sel.address, profile.address);
        }
        if (sel.phone && profile.phone) {
            await this.ensureVisible(page, sel.phone);
            await page.fill(sel.phone, profile.phone);
        }
        for (const c of this.entry.config?.checkboxes ?? []) {
            await this.ensureVisible(page, c);
            const checked = await page.isChecked(c);
            if (!checked)
                await page.click(c);
        }
        if (this.entry.requirements.includes("captcha")
            || this.entry.requirements.includes("id-upload")) {
            await waitForEnter(`Site: ${this.entry.name}\nIf needed, solve CAPTCHA or upload ID in the browser window.`);
        }
        if (sel.submit) {
            await this.ensureVisible(page, sel.submit);
            await page.click(sel.submit);
        }
        if (typeof cfg.postSubmitWaitMs === "number" && cfg.postSubmitWaitMs > 0) {
            await page.waitForTimeout(cfg.postSubmitWaitMs);
        }
        if (this.entry.requirements.includes("email-verification")) {
            await waitForEnter(`Site: ${this.entry.name}\nComplete any email verification (click the link in your inbox). When done, return here.`);
        }
    }
}
