#!/usr/bin/env node
// Read-only health check for data/manifest.json.
//
// Loads every removalUrl once in headless Chromium and reports which entries
// are dead, blocked to automated browsers, or redirected somewhere else.
// It only navigates and reads the page title and visible text. It never types
// into a field and never clicks, so no personal data is sent anywhere, and it
// does not load a profile.
//
// Usage:
//   npm run check:manifest
//   node scripts/check-manifest.mjs [--manifest <path>] [--json <path>] [--concurrency <n>]
//
// Exit code: 1 when at least one entry is dead, otherwise 0. "Blocked" does
// not fail the run: those sites refuse headless browsers and have to be
// checked by a person in a visible browser.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const manifestPath = option("manifest", "data/manifest.json");
const jsonPath = option("json", null);
const concurrency = Math.max(1, Math.min(10, Number(option("concurrency", "6")) || 6));
const MAX_ENTRIES = 500; // circuit breaker against a runaway manifest
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_MS = 4_000; // lets client-side redirects and bot challenges show themselves

// A plain desktop Chrome user agent. Headless Chromium otherwise announces
// itself as "HeadlessChrome" and many sites answer that with a block page,
// which would hide whether the opt-out page still exists. Nothing else about
// the browser is disguised.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const CHALLENGE = /just a moment|verify (that )?you are (a )?human|checking your browser|access denied|attention required|are you a robot|press & hold|unusual traffic|request blocked|pardon our interruption/i;
const GONE = /transferred by court order|domain (is|may be) for sale|buy this domain|this domain has expired|domain update/i;
const NOT_FOUND = /\b404\b|page not found|not found|page (doesn.t|does not) exist|no longer available/i;
const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);

/** Path without a trailing slash, so /optout and /optout/ compare equal. */
function normalizedPath(url) {
  return new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
}

/** Host without a leading www., so www.example.com and example.com compare equal. */
function normalizedHost(url) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function classify(entry, observed) {
  if (observed.error) {
    // Some bot walls (Akamai and similar) reset the HTTP/2 stream instead of
    // answering 403, so this error means "refused", not "gone".
    if (/ERR_HTTP2_PROTOCOL_ERROR/.test(observed.error)) {
      return { verdict: "blocked", reason: observed.error };
    }
    return { verdict: "dead", reason: observed.error };
  }
  const head = `${observed.title} ${observed.text.slice(0, 1500)}`;
  if (GONE.test(head)) {
    return { verdict: "dead", reason: `domain gone: "${observed.title}"` };
  }
  if (BLOCKED_STATUSES.has(observed.status) || CHALLENGE.test(head)) {
    return { verdict: "blocked", reason: `HTTP ${observed.status}, "${observed.title}"` };
  }
  if (observed.status >= 400) {
    return { verdict: "dead", reason: `HTTP ${observed.status}` };
  }
  if (NOT_FOUND.test(`${observed.title} ${observed.text.slice(0, 300)}`) && !/opt.?out|remov|suppress/i.test(observed.title)) {
    return { verdict: "dead", reason: `page says not found: "${observed.title}"` };
  }
  const hostChanged = normalizedHost(observed.finalUrl) !== normalizedHost(entry.removalUrl);
  const pathChanged = normalizedPath(observed.finalUrl) !== normalizedPath(entry.removalUrl);
  if (hostChanged || pathChanged) {
    return { verdict: "redirected", reason: `now at ${observed.finalUrl}` };
  }
  return { verdict: "ok", reason: "" };
}

async function check(browser, entry) {
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const observed = { status: null, finalUrl: entry.removalUrl, title: "", text: "", error: null };
  try {
    const response = await page.goto(entry.removalUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    observed.status = response?.status() ?? null;
    observed.finalUrl = page.url();
    observed.title = (await page.title()).trim().slice(0, 100);
    observed.text = (await page.evaluate(() => document.body?.innerText ?? "")).replace(/\s+/g, " ").slice(0, 2000);
  } catch (error) {
    observed.error = String(error).split("\n")[0].replace(/^Error: page\.goto: /, "").slice(0, 120);
  } finally {
    await context.close();
  }
  return { name: entry.name, category: entry.category ?? null, url: entry.removalUrl, ...observed, ...classify(entry, observed) };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const withUrl = manifest.filter((entry) => entry.removalUrl).slice(0, MAX_ENTRIES);
const withoutUrl = manifest.length - withUrl.length;

const browser = await chromium.launch({ headless: true });
const results = [];
let next = 0;
async function worker() {
  while (next < withUrl.length) {
    const entry = withUrl[next++];
    const result = await check(browser, entry);
    results.push(result);
    process.stderr.write(`[${results.length}/${withUrl.length}] ${result.verdict.padEnd(10)} ${entry.name}\n`);
  }
}
try {
  await Promise.all(Array.from({ length: concurrency }, worker));
} finally {
  await browser.close();
}

results.sort((a, b) => a.name.localeCompare(b.name));
const groups = { dead: [], blocked: [], redirected: [], ok: [] };
for (const result of results) groups[result.verdict].push(result);

const headings = {
  dead: "DEAD (page missing, domain gone or server error)",
  blocked: "BLOCKED (refuses a headless browser; check by hand in a visible browser)",
  redirected: "REDIRECTED (loads, but at a different address; confirm it is still the opt-out)",
};
for (const verdict of ["dead", "blocked", "redirected"]) {
  if (groups[verdict].length === 0) continue;
  console.log(`\n${headings[verdict]}`);
  for (const result of groups[verdict]) {
    console.log(`  ${result.name}: ${result.url}\n      ${result.reason}`);
  }
}

console.log(`\nManifest health check: ${manifestPath}`);
console.log(`  entries:    ${manifest.length}${withoutUrl ? ` (${withoutUrl} without a removalUrl, not checked)` : ""}`);
console.log(`  ok:         ${groups.ok.length}`);
console.log(`  redirected: ${groups.redirected.length}`);
console.log(`  blocked:    ${groups.blocked.length}`);
console.log(`  dead:       ${groups.dead.length}`);

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(results, null, 1));
  console.log(`  details:    ${jsonPath}`);
}

process.exit(groups.dead.length > 0 ? 1 : 0);
