#!/usr/bin/env node
import { chromium } from "@playwright/test";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import { promises as fs } from "fs";
import { BrokerEntry, PersonProfile, RunOptions, OptOutResult } from "./types.js";
import { Logger } from "./utils/logger.js";
import { GenericFormAdapter } from "./adapters/GenericFormAdapter.js";
import { SpokeoAdapter } from "./adapters/sites/SpokeoAdapter.js";
import { WhitepagesAdapter } from "./adapters/sites/WhitepagesAdapter.js";
import { NuwberAdapter } from "./adapters/sites/NuwberAdapter.js";
import { RadarisAdapter } from "./adapters/sites/RadarisAdapter.js";
import { BeenVerifiedAdapter } from "./adapters/sites/BeenVerifiedAdapter.js";
import { InteliusAdapter } from "./adapters/sites/InteliusAdapter.js";
import { MyLifeAdapter } from "./adapters/sites/MyLifeAdapter.js";

const argv = await yargs(hideBin(process.argv))
  .option("manifest", { type: "string", demandOption: true })
  .option("profile",  { type: "string", demandOption: true })
  .option("headful",  { type: "boolean", default: false })
  .parse();

const opts: RunOptions = {
  manifestPath: argv.manifest,
  profilePath: argv.profile,
  headful: argv.headful
};

const BrokerEntrySchema = z.object({
  name: z.string(),
  removalUrl: z.string().url().optional().nullable(),
  requirements: z.array(z.enum(["online","email","phone","captcha","email-verification","id-upload","unknown"])),
  adapter: z.enum(["generic","Spokeo","Whitepages","Nuwber","Radaris","BeenVerified","Intelius","MyLife"]),
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

function makeAdapter(entry: BrokerEntry) {
  switch (entry.adapter) {
    case "Spokeo": return new SpokeoAdapter(entry);
    case "Whitepages": return new WhitepagesAdapter(entry);
    case "Nuwber": return new NuwberAdapter(entry);
    case "Radaris": return new RadarisAdapter(entry);
    case "BeenVerified": return new BeenVerifiedAdapter(entry);
    case "Intelius": return new InteliusAdapter(entry);
    case "MyLife": return new MyLifeAdapter(entry);
    default: return new GenericFormAdapter(entry);
  }
}

(async () => {
  console.log("=".repeat(60));
  console.log("🚀 Data Broker Opt-Out Runner");
  console.log("=".repeat(60));

  const logger = new Logger("./", `optouts-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.jsonl`);
  const manifestRaw = await fs.readFile(opts.manifestPath, "utf-8");
  const profileRaw  = await fs.readFile(opts.profilePath, "utf-8");

  const manifest = z.array(BrokerEntrySchema).parse(JSON.parse(manifestRaw)) as BrokerEntry[];
  const profile  = ProfileSchema.parse(JSON.parse(profileRaw)) as PersonProfile;

  console.log(`\n📋 Loaded ${manifest.length} data brokers from manifest`);
  console.log(`👤 Profile: ${profile.fullName} (${profile.email})`);
  console.log(`🌐 Browser mode: ${opts.headful ? "Headful (visible)" : "Headless"}`);
  console.log(`📝 Log file: ${logger.path()}`);
  console.log("\n" + "=".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: !opts.headful, args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome Safari",
  });

  const stats = { success: 0, failed: 0, skipped: 0, manualNeeded: 0 };
  const totalBrokers = manifest.length;

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i]!;
    const brokerNum = i + 1;

    console.log(`\n[${ brokerNum}/${totalBrokers}] Processing: ${entry.name}`);
    console.log(`    URL: ${entry.removalUrl || "N/A"}`);
    console.log(`    Adapter: ${entry.adapter}`);
    console.log(`    Requirements: ${entry.requirements.join(", ")}`);

    const start = new Date().toISOString();
    const base: OptOutResult = {
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
        stats.skipped++;
        console.log(`    ⊘ Skipped: ${base.message}`);
        continue;
      }

      if (entry.requirements.includes("email") && !entry.requirements.includes("online")) {
        base.status = "manual-needed";
        base.message = "Email-only removal. See notes/website.";
        await logger.append(base);
        stats.manualNeeded++;
        console.log(`    ⚠ Manual needed: ${base.message}`);
        continue;
      }
      if (entry.requirements.includes("phone") && !entry.requirements.includes("online")) {
        base.status = "manual-needed";
        base.message = "Phone-only removal. See notes/website.";
        await logger.append(base);
        stats.manualNeeded++;
        console.log(`    ⚠ Manual needed: ${base.message}`);
        continue;
      }

      const adapter = makeAdapter(entry);
      await adapter.run(context, profile);

      base.status = "success";
      base.message = "Submitted (some steps may have been manual).";
      await logger.append(base);
      stats.success++;
      console.log(`    ✓ Success: ${base.message}`);
    } catch (err) {
      base.status = "failed";
      base.message = err instanceof Error ? err.message : "Unknown error";
      await logger.append(base);
      stats.failed++;
      console.log(`    ✗ Failed: ${base.message}`);
    }

    // Add small delay between sites to avoid rate limiting
    if (i < manifest.length - 1) {
      console.log(`    ⏱  Waiting 2 seconds before next site...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await context.close();
  await browser.close();

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary Report");
  console.log("=".repeat(60));
  console.log(`Total brokers processed: ${totalBrokers}`);
  console.log(`✓ Successful: ${stats.success}`);
  console.log(`✗ Failed: ${stats.failed}`);
  console.log(`⊘ Skipped: ${stats.skipped}`);
  console.log(`⚠ Manual needed: ${stats.manualNeeded}`);
  console.log("=".repeat(60));

  console.log(`\nAudit log written to: ${logger.path()}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});