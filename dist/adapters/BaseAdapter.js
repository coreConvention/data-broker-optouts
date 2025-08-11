export class BaseAdapter {
    entry;
    constructor(entry) {
        this.entry = entry;
    }
    async run(context, profile) {
        const page = await context.newPage();
        try {
            if (!this.entry.removalUrl)
                throw new Error("No removalUrl provided.");
            await page.goto(this.entry.removalUrl, { waitUntil: "load", timeout: 60_000 });
            await this.execute(page, profile);
        }
        finally {
            await page.close();
        }
    }
    async ensureVisible(page, selector) {
        await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
    }
}
