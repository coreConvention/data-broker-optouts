#!/usr/bin/env node
import { chromium } from "@playwright/test";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import { promises as fs } from "fs";
import { Logger } from "./utils/logger.js";
import { GenericFormAdapter } from "./adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "./adapters/sites/SpokeoAdapter.js";
import { WhitepagesAdapter } from "./adapters/sites/WhitepagesAdapter.js";
const argv = await yargs(hideBin(process.argv))
    .option("manifest", { type: "string", demandOption: true })
    .option("profile", { type: "string", demandOption: true })
    .option("headful", { type: "boolean", default: false })
    .parse();
const opts = {
    manifestPath: argv.manifest,
    profilePath: argv.profile,
    headful: argv.headful
};
const BrokerEntrySchema = z.object({
    name: z.string(),
    removalUrl: z.string().url().optional().nullable(),
    requirements: z.array(z.enum(["online", "email", "phone", "captcha", "email-verification", "id-upload", "unknown"])),
    adapter: z.enum(["generic", "Spokeo", "Whitepages"]),
    notes: z.string().optional().nullable(),
    config: z.object({
        selectors: z.object({
            name: z.string().optional(),
            email: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zip: z.string().optional(),
            address: z.string().optional(),
            phone: z.string().optional(),
            submit: z.string().optional()
        }).partial().optional(),
        checkboxes: z.array(z.string()).optional(),
        postSubmitWaitMs: z.number().optional()
    }).partial().optional()
});
const ProfileSchema = z.object({
    fullName: z.string(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    email: z.string().email(),
    altEmails: z.array(z.string().email()).optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional()
});
function makeAdapter(entry) {
    switch (entry.adapter) {
        case "Spokeo": return new SpokeoAdapter(entry);
        case "Whitepages": return new WhitepagesAdapter(entry);
        default: return new GenericFormAdapter(entry);
    }
}
(async () => {
    const logger = new Logger("./", `optouts-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jsonl`);
    const manifestRaw = await fs.readFile(opts.manifestPath, "utf-8");
    const profileRaw = await fs.readFile(opts.profilePath, "utf-8");
    const manifest = z.array(BrokerEntrySchema).parse(JSON.parse(manifestRaw));
    const profile = ProfileSchema.parse(JSON.parse(profileRaw));
    const browser = await chromium.launch({ headless: !opts.headful, args: ["--disable-blink-features=AutomationControlled"] });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome Safari",
    });
    for (const entry of manifest) {
        const start = new Date().toISOString();
        const base = {
            site: entry.name,
            status: "failed",
            ts: start,
            ...(entry.removalUrl ? { url: entry.removalUrl } : {})
        };
        try {
            if (!entry.removalUrl && !entry.requirements.includes("email") && !entry.requirements.includes("phone")) {
                base.status = "skipped";
                base.message = "No online/email/phone path defined.";
                await logger.append(base);
                continue;
            }
            if (entry.requirements.includes("email") && !entry.requirements.includes("online")) {
                base.status = "manual-needed";
                base.message = "Email-only removal. See notes/website.";
                await logger.append(base);
                continue;
            }
            if (entry.requirements.includes("phone") && !entry.requirements.includes("online")) {
                base.status = "manual-needed";
                base.message = "Phone-only removal. See notes/website.";
                await logger.append(base);
                continue;
            }
            const adapter = makeAdapter(entry);
            await adapter.run(context, profile);
            base.status = "success";
            base.message = "Submitted (some steps may have been manual).";
            await logger.append(base);
        }
        catch (err) {
            base.status = "failed";
            base.message = err instanceof Error ? err.message : "Unknown error";
            await logger.append(base);
        }
    }
    await context.close();
    await browser.close();
    console.log(`\nAudit log written to: ${logger.path()}`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
