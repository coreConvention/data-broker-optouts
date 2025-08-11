import { BaseAdapter } from "../BaseAdapter.js";
import { waitForEnter } from "../../utils/human.js";
export class WhitepagesAdapter extends BaseAdapter {
    name() { return "Whitepages"; }
    async execute(page, _profile) {
        await waitForEnter("On Whitepages: locate your listing, open the suppression request, and follow on-screen steps. Solve CAPTCHA if present, then submit.");
        await page.waitForTimeout(4000);
    }
}
