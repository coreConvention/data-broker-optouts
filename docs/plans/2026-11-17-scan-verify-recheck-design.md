# Scan, verify, re-check: design plan

Date: 2026-11-17. Tracks issue #27. Design only; no feature code ships with this document.

## 1. Why the design changes

The goal of the project is to get a person's records removed from data brokers and keep them removed. Today the tool opens an opt-out page, fills a form once and writes `success` when no exception is thrown. That cannot meet the goal, for four reasons found in the 2026-11-17 audit (#25, #26, #27):

- It never finds the person's listing, although every major people-search opt-out is keyed on one specific listing.
- It never checks afterwards that the listing is gone.
- It never looks again, although listings routinely return. `--resume` does the opposite: a broker logged as `success` is skipped for good.
- It submits blind, which can hand a broker details it did not have.

The new flow, per broker, is:

```
scan ──► nothing found ──► record "not-found", send nothing
  │
  └──► candidates ──► person confirms which are theirs ──► request removal (per listing)
                                                              │
                         re-scan every 3-4 months ◄── verify after the broker's window
```

Everything below is written against the code as it stands on `main` today.

## 2. What the brokers do today

### 2.1 What was loaded first-hand

Each opt-out URL was opened once on 2026-11-17 in an ordinary desktop browser window. Nothing was typed, nothing was clicked, no challenge was attempted.

| Broker (parent) | URL opened | What came back |
|---|---|---|
| Whitepages | `whitepages.com/suppression-requests` | Loaded. "Opt-out of Whitepages, STEP 1 OF 5 ... Copy and paste the URL of your profile", one field and a Next button. |
| PeopleConnect (Intelius, TruthFinder, Instant Checkmate, US Search) | `suppression.peopleconnect.us/login` | Loaded (script-rendered). "Step 1: Enter your email address", a consent checkbox, Continue. The page says a verification email with a link follows. A separate mail address is given for judges, law enforcement and other legally protected people. |
| FastPeopleSearch | `fastpeoplesearch.com/removal` | Redirected to `/optout` and loaded. Four listed steps: (1) choose "subject" or "authorized agent", enter name and email, solve a CAPTCHA; (2) click the emailed link (the page says to start again after 24 hours); (3) fill a second form that "should match the information on the record you want removed"; (4) a confirmation page. |
| Spokeo | `spokeo.com/optout` | HTTP 403 "Forbidden". No form shown. |
| BeenVerified | `beenverified.com/app/optout/search` | HTTP 403 with a Cloudflare "Performing security verification" page. |
| TruePeopleSearch | `truepeoplesearch.com/removal` | HTTP 403 with a Cloudflare page titled "Captcha Challenge". |

So three of the six would not show their opt-out page to a normal browser session on first load. This matters for section 8: the tool cannot count on reading these sites unattended, and must not try to force its way in.

### 2.2 What is known only second-hand

The steps after the first page could not be seen without typing personal data, so they come from published guides. Several guides are written by paid removal services. Where sources disagree, both are given. Nothing in this table is confirmed against the live site, and every adapter issue starts with a person walking the real flow once (section 10).

| Broker | Flow after page one | Human-only steps | Stated window | Notes |
|---|---|---|---|---|
| Whitepages | Paste profile URL, confirm it is you, choose a reason, enter a phone number, receive an automated call and key in the code shown on screen (Optery guide, Oct 2025). One request per profile URL. | The phone call. | Not on the page seen; 24 to 72 hours in third-party catalogues. | The Big Ass Data Broker Opt-Out List (BADBOOL) warns that Whitepages Premium pages may survive a standard removal. 411.com is the same company. |
| PeopleConnect | Emailed link (expires in about 15 minutes), date of birth, legal name, choose your record, a one-time code sent to a contact already on the record, set the record to "suppressed" (Incogni guide, Aug 2026). | Emailed link; the one-time code. | 48 to 72 hours (Incogni); not confirmed. | The listing search happens only after the email and date of birth have been given. DeleteMe says PeopleConnect rejects requests made on someone's behalf. |
| BeenVerified | Search by name and state, choose the listing, enter email, CAPTCHA, emailed link (DeleteMe guide, Sep 2026). | CAPTCHA; emailed link. | 24 hours to 72 hours, depending on the guide. | BADBOOL: one opt-out per email address, more by writing to them. Whether one request also covers PeopleLooker, NeighborWho and Ownerly is disputed between guides. |
| Spokeo | Search, open your listing, copy its URL, paste URL plus email at `/optout`, CAPTCHA, emailed link (Incogni, Sep 2026; BADBOOL agrees). One request per listing URL. | CAPTCHA; emailed link. | 24 to 48 hours (Incogni); 2 to 3 business days elsewhere. | BADBOOL: listings can return under a new URL, and paid accounts may still see removed data. California's registry lists thatsthem.com and anywho.com under Spokeo, Inc. |
| TruePeopleSearch | Two descriptions: (a) email, CAPTCHA, then search and "Remove This Record", then emailed link (DuckDuckGo help page); (b) name and email first, emailed link, second form (Incogni, Aug 2026). | CAPTCHA (several, per BADBOOL); emailed link. | "Within 72 hours" on the confirmation page (DuckDuckGo help page). | Registered in California as Free Data Services, LLC. |
| FastPeopleSearch | Matches the page seen. The second form asks for date of birth or address, and reportedly will not submit without a phone number (DeleteMe, Sep 2026). | CAPTCHA; emailed link. | 72 hours (DeleteMe). | DeleteMe says requests from states without a privacy law may be ignored. Registered in California as Mississippi Tornado Alley, LLC, a different company from TruePeopleSearch. |

### 2.3 The stronger channels

- **California DROP** (`privacy.ca.gov/drop`), read 2026-11-17: open to California residents since 1 January 2026; brokers have had to process requests since 1 August 2026, must check the platform at least every 45 days and delete again on that cycle. The page says more than 600 brokers are registered. It asks for name, date of birth, ZIP, email and phone. All six parents above appear in the state's broker registry (as Spokeo, Inc.; Whitepages, Inc; BeenVerified, LLC; Intelius, TruthFinder and Instant Checkmate; Free Data Services, LLC; Mississippi Tornado Alley, LLC). For a California resident, one DROP request does more than this tool can, and repeats itself.
- **Address Confidentiality Programs**: NNEDV's Safety Net project keeps a state-by-state page at `techsafety.org/address-confidentiality-programs` (its chart is dated March 2023). The National Domestic Violence Hotline is 1-800-799-7233, text START to 88788, chat at `thehotline.org`.
- **How often to look again**: Privacy Guides says to repeat the process "every 3, 6, or 12 months depending on your risk level". The reference project below uses 90 days.
- **Consumer Reports, 2024**: its own pages refused to load, so only second-hand figures are available: paid services removed 35% of profiles within four months, and manual opt-outs did markedly better in the first week. The README should cite it only once someone has read the report itself (#26).

## 3. What to borrow from `stephenlthorn/auto-identity-remove`

That project (MIT, JavaScript, Playwright) is the closest open-source relative. Read on 2026-11-17: `README.md`, `STATUS.md`, `brokers.js`, `lib/forms.js`, `lib/verify-loop.js`, `lib/stealth.js`, `lib/captcha.js`.

**Borrow**

1. *"Cannot tell" is never "not listed".* Its `findListingUrl` returns "no listing" only when the search page clearly loaded with real content. A failed load, a non-2xx answer, a bot wall, a blank page or a page still rendering all raise "unverifiable". Its comments record why: a 403 was once written down as a verified removal. Our `unknown` state exists for this.
2. *A search definition per broker*: a search URL built from the person's name and place, plus a pattern that recognises a listing link. Its BeenVerified entry is a warning about loose patterns: `/beenverified\.com/` matched the site logo, so verification always said "still listed".
3. *Verification as its own pass* that submits nothing, runs only after a waiting period, and writes dated outcomes with a short history.
4. *A state file with a 90-day window*, stamped with a short hash of the person's details so that a corrected profile does not inherit the old person's results.
5. *Honest wording*: "Submitted ≠ confirmed deleted", and a per-broker table that admits none of its 51 hand-written entries is currently verified against the live site.
6. *Keeping personal data out of logs*: it strips full URLs from error messages because the URL carries the person's name.

**Avoid**

1. *Paid CAPTCHA solving* (CapSolver) and its *stealth script* (hides `navigator.webdriver`, fakes plugins, rewrites the headless user agent). Both defeat bot protection. See section 8.
2. *Unattended monthly runs.* Our tool keeps a person present, which is also what lets it stay honest about CAPTCHAs and verification.
3. *A heuristic runner over about 490 sites.* Its own notes describe that runner submitting a marketing sign-up form as if it were an opt-out, the same failure as our #25.
4. *Picking the listing automatically.* It takes the first link containing the surname. Two people can share a name; choosing the wrong one files a removal for a stranger and leaves the user listed. The person must choose.
5. *"They already have your info"* as a reason to submit everywhere. We scan first and send nothing where nothing is found.
6. *Inbox access* (it reads mail over IMAP to click confirmation links) and "noise mode" (bogus records). Out of scope and out of character for this tool.

## 4. Scan before submit

### 4.1 Adapter contract

`BaseAdapter` today has one entry point, `run(context, profile, execContext)`, which opens `entry.removalUrl` and calls `execute(page, profile)`. Nothing is returned, so the orchestrator cannot tell what happened.

Add a second, richer contract next to it in `src/adapters/ListingAdapter.ts`. Adapters that implement it are driven through the new flow; adapters that do not keep working through `run()` and are treated as guided-manual (section 7.2).

```ts
/** One candidate record on a broker's site. */
export interface Listing {
  /** Stable for this broker: the listing URL without query string. */
  id: string;
  url: string;
  /** What the broker shows, so the person can tell records apart: name, age, places. */
  summary: string;
}

export type ScanResult =
  | { kind: "found"; listings: Listing[] }
  | { kind: "not-found" }                    // the results page loaded and was empty
  | { kind: "unknown"; reason: string };     // blocked, errored, unreadable

export type RemovalResult =
  | { kind: "requested"; pending?: "email-link" | "phone-call" }
  | { kind: "not-completed"; reason: string };

export type VerifyResult =
  | { kind: "removed" }
  | { kind: "listed" }
  | { kind: "unknown"; reason: string };

export interface ListingAdapter {
  /** Stable key used in the state file, e.g. "whitepages". */
  readonly brokerId: string;
  /** Days to wait after a request before verifying. */
  readonly removalWindowDays: number;
  /** Profile fields each step may receive. Nothing else is passed in. */
  readonly fields: { scan: (keyof PersonProfile)[]; request: (keyof PersonProfile)[] };

  findListings(page: Page, person: Partial<PersonProfile>, ctx: ExecutionContext): Promise<ScanResult>;
  requestRemoval(page: Page, listing: Listing, person: Partial<PersonProfile>, ctx: ExecutionContext): Promise<RemovalResult>;
  verifyRemoval(page: Page, listing: Listing, ctx: ExecutionContext): Promise<VerifyResult>;
}
```

Rules that go with the contract:

- `findListings` and `verifyRemoval` only read. They never fill a form on the broker's opt-out page.
- `findListings` returns `not-found` only when it positively recognises an empty results page. Any doubt is `unknown`.
- When the automatic search is blocked or unreadable, the adapter falls back to a **guided scan**: it opens the broker's search page for the person (`ioProvider.openExternal` or the visible Playwright window), and asks them through `ioProvider.promptUser` to paste the address of each listing that is theirs, or to answer "none". This is how the brokers in section 2.1 that returned 403 are handled. A guided "none" is recorded as `not-found` with `source: "person"`.
- `requestRemoval` is called once per confirmed listing and receives only `fields.request`.
- Each adapter takes its base URL from a constructor option so tests can point it at local fixtures.

`BaseAdapter` keeps its helpers (`retryOperation`, `tryFillField`, `detectSuccess`). `AdapterFactory.createAdapter` gains a sibling `createListingAdapter(entry): ListingAdapter | null`.

### 4.2 Showing candidates through `IOProvider`

Add one optional method to `IOProvider` in `src/types.ts`, in the same style as the optional `reportProgress`:

```ts
selectListings?(request: { broker: string; listings: Listing[] }): Promise<string[]>; // chosen ids
```

A small helper, `chooseListings(io, request)`, calls it when present and otherwise falls back to `promptUser` with a numbered list ("Which of these are you? e.g. 1,3 or none"). That gives:

- `CliIOProvider`: works on day one through the fallback; a nicer numbered prompt can follow.
- `ElectronIOProvider`: sends the existing `run:human-input` event with a new `type: "select"` and the candidate list; `resolveHumanInput` returns the chosen ids. The renderer's `human-input-modal` gains a checklist view (#45). Until then the fallback prompt works in the existing modal.

The default is nothing selected. The person must pick; the tool never picks for them.

### 4.3 Orchestrator

`ExecutionOrchestrator.executeBroker` gains a branch ahead of `handleActualExecution`:

```
adapter = AdapterFactory.createListingAdapter(entry)
if adapter:
    scan      = adapter.findListings(...)
    unknown   -> state "unknown", stop for this broker
    not-found -> state "not-found", nothing is sent
    found     -> chosen = chooseListings(...)
                 none chosen -> state "not-found" (candidates were not the person)
                 for each chosen: requestRemoval(...) -> state "requested" or stays "listed"
else:
    existing path (guided-manual after #25)
```

`handleActualExecution` no longer writes `success` because nothing threw. `OptOutResult.status` (the per-run log line) becomes the broker state from section 5 plus the existing `manual-needed`, `skipped`, `failed`. `RunProgress`, the `RunProgressLike` copy in `desktop/main/providers/ElectronIOProvider.ts`, `StatisticsTracker` and the renderer's status badge follow the same vocabulary. Every result still goes through `recordResult()`.

Dry run changes meaning: it performs the scan (read-only) and reports what it would request, instead of logging a simulated `success`.

## 5. Verify and keep evidence

### 5.1 States

One state per broker, the worst case across that broker's listings.

| State | Meaning | Set by |
|---|---|---|
| `unknown` | Never scanned, or the last look could not tell. | default; any blocked or unreadable scan or verify |
| `not-found` | A scan loaded properly and found no listing the person recognised. Nothing was sent. | scan |
| `listed` | At least one confirmed listing, no request outstanding. | scan; verify that still finds it |
| `requested` | A removal request was completed for every confirmed listing and the window has not passed. | request |
| `removed` | After the window, each requested listing was looked for and was gone. | verify |
| `relisted` | A later scan found a listing at a broker that had been `removed`. Treated like `listed`, and counted. | re-scan |

`removed` means "not found when we looked on that date". The UI and logs must say it in those words, not "deleted".

### 5.2 Verify pass

A separate command (`--verify` on the CLI, a button in the desktop app) that submits nothing. For each broker in `requested` whose `verifyAfter` date has passed, it calls `verifyRemoval` for each listing, which loads the listing address and then repeats the scan, because a listing can move to a new address. Outcome: `removed`, `listed` (with an attempt count, so a broker that ignores two requests is visible) or `unknown`.

`removalWindowDays` per adapter is the broker's stated window rounded up, never less than 3. A request that is still waiting on the person (unclicked email link, unanswered call) stays `listed`, with `pending` recorded, so it is not mistaken for progress.

### 5.3 Evidence

A screenshot is taken at three moments: the confirmed listing as found, the broker's confirmation page after the request, and the result of each verify. Screenshots show the person's name and address, so:

- CLI: `data/evidence/<brokerId>/<timestamp>-<event>.png`. Desktop: the same folder under the app's data directory (`getDataPath()`).
- `.gitignore` gains `data/evidence/` and `data/state.json` explicitly. `*.png` is already ignored, but an explicit folder rule survives someone changing the image format.
- `BaseAdapter.captureErrorScreenshot` currently writes to `./logs`; it moves to the evidence folder so that every image with personal details lives in one place.
- File names carry the broker id and a timestamp, never the person's name. The state file stores the relative path.
- A manifest test asserts that `git check-ignore` covers both paths.
- Evidence never leaves the machine. There is no upload, no telemetry.

## 6. Re-check schedule

### 6.1 State file

`data/state.json`, next to the profile (desktop: under `getDataPath()`), read and written by a new `src/services/StateStore.ts` and validated with a Zod schema in `src/config/schemas.ts`.

```json
{
  "version": 1,
  "person": "a1b2c3d4e5f6",
  "guidanceShownAt": "2026-11-17T18:00:00Z",
  "brokers": {
    "whitepages": {
      "state": "requested",
      "lastScannedAt": "2026-11-17T18:05:00Z",
      "lastRequestedAt": "2026-11-17T18:11:00Z",
      "verifyAfter": "2026-11-20T18:11:00Z",
      "lastVerifiedAt": null,
      "nextCheckDue": "2027-02-15T18:05:00Z",
      "timesRelisted": 0,
      "listings": [
        { "id": "…", "url": "…", "state": "requested", "requestAttempts": 1, "pending": null }
      ],
      "history": [
        { "at": "2026-11-17T18:05:00Z", "event": "scan", "result": "listed", "evidence": "evidence/whitepages/20261117T180500-scan.png" }
      ]
    }
  }
}
```

- `person` is a short hash of the normalised name, ZIP and email. If the profile changes, entries with a different hash are treated as `unknown` instead of being trusted.
- Writes are atomic (write a temporary file, then rename). If the file exists but cannot be read, the run stops with a clear message instead of starting a fresh history over it.
- `history` is capped (20 entries per broker).
- Listing addresses contain the person's name. The file is local, ignored by git, and never logged in full.

### 6.2 What replaces `--resume`

`ResumeService` reads an old JSONL log and drops every broker whose line says `success`. It is replaced by a pure function in the new store, `dueBrokers(state, now)`:

| State | Due when |
|---|---|
| `unknown`, `listed`, `relisted` | now |
| `requested` | `verifyAfter` has passed (verify only) |
| `removed`, `not-found` | `nextCheckDue` has passed |

`nextCheckDue` is the last scan or verify plus the re-check interval: 90 days by default, settable up to 120 (`--recheck-days`, and a desktop setting). At-risk users can set it lower.

At the start of every run, and on the desktop dashboard, the tool states what is due in plain words, for example "4 brokers are due for a re-check (last looked 3 months ago), 1 request is ready to verify". A default run works through what is due; `--all` forces everything. `--resume` stays for one release as an accepted flag that prints "replaced by the state file" and does nothing else, then goes. `ResumeService` and its tests are deleted with it. The JSONL run log stays as the audit trail of each run.

The tool does not install a scheduled job. It tells the person when they open it. Whether to add an operating-system reminder is an open question (section 12).

## 7. Scope

### 7.1 First: six people-search parents

| Order | Parent | Sites one request is meant to cover | Why |
|---|---|---|---|
| 1 | Whitepages | Whitepages, 411.com | The vertical slice (section 10). |
| 2 | PeopleConnect | Intelius, TruthFinder, Instant Checkmate, US Search | One suppression covers four large sites; its page loads. |
| 3 | Spokeo | Spokeo (thatsthem.com and anywho.com are the same company) | Large; clean one-URL-per-listing flow. |
| 4 | BeenVerified | BeenVerified (PeopleLooker and others disputed) | Large; one opt-out per email address needs handling. |
| 5 | TruePeopleSearch | TruePeopleSearch | Free to search, so it is where a stalker looks first. |
| 6 | FastPeopleSearch | FastPeopleSearch | Same reason; its page loads. |

These are the sites that publish a home address to anyone for free or for a few dollars, and the parents that feed the most look-alike sites. Doing six well, with scan and verify, removes more real exposure than a hundred unverified form fills. For each, "covers" is a claim to be checked by scanning the sibling sites too, not assumed.

### 7.2 The long tail

- `GenericFormAdapter` stops being an automatic submitter. After #25 it types nothing on unverified entries; under this plan it has no `findListings`, so it can never reach `requested` on its own. It becomes the guided-manual path: open the page, show the manifest notes, let the person act, then ask what happened and record that with `source: "person"`.
- A manifest entry may later gain a `scan` block (search address template and listing pattern, as in the reference project) so that scan and verify work for it without a hand-written adapter. Requests for such entries stay manual. This is the only way a manifest-only broker gets automation, and it is read-only automation.
- Entries that are not people-search removals (credit-bureau marketing lists, ad-tech cookie opt-outs, Do Not Call; see #26) move to a separate checklist. They have no listing to scan, so they sit outside this flow and outside the state machine.
- Dead and duplicate entries are #26's work and are assumed done before the long-tail issue starts.

## 8. What stays human, and the stealth module

The person, not the tool, does these: CAPTCHAs and any bot challenge; clicking emailed confirmation links; answering verification calls and entering codes; choosing which listing is theirs; anything that needs an ID document. The tool waits through `ioProvider.waitForConfirmation` and records the step as pending until the person says it is done.

The tool must not defeat bot protection. `src/utils/stealth.ts` does exactly that by design. Its own header says it "Helps bypass basic bot detection measures". It hides `navigator.webdriver`, fakes the plugin list, picks a random real-looking user agent and viewport, passes `--disable-blink-features=AutomationControlled`, and offers `humanType` and `humanClick` to imitate a person's hands. It is on by default (`--stealth` defaults to true in `src/config/cli.ts`; `options.stealth ?? true` in `desktop/main/ipc/run.ipc.ts`). Even with stealth off, `BrowserFactory` still passes the `AutomationControlled` flag and sends a made-up user agent. The README says the tool never bypasses security measures. The two cannot both stand.

**Recommendation: remove it.**

- Delete `src/utils/stealth.ts`, the `--stealth` option, the desktop `stealth` run option and its settings toggle. `BrowserFactory` launches plain Chromium with its real user agent and no evasion flags.
- Runs that touch a live site are always in a visible window with the person present. Headless stays available only for the fixture tests.
- A bot wall (403, a challenge page, a CAPTCHA before content) is detected and reported as `unknown`. The tool then offers the guided path: open the page in the person's own browser and let them carry on. It does not retry with tricks.
- The pause between brokers stays. Being slow is courtesy, not disguise.

The cost is real and should be accepted knowingly: section 2.1 shows three of six brokers refusing a normal browser on first load, so for those the scan will often be guided, not automatic. That is the honest version of the tool. The reference project's own stealth header concedes that its script does not get past serious protection either.

## 9. First-run guidance and minimum data

Shown once, before the first run, through `IOProvider` (CLI text; a desktop screen), recorded as `guidanceShownAt` in the state file, and always reachable from the README and a menu item.

1. **California residents: use DROP first.** `privacy.ca.gov/drop`. One request reaches every registered broker and is repeated every 45 days. This tool is then useful for checking what is still visible.
2. **If someone may be looking for you.** Opt-outs reduce exposure; they do not make a person safe. The steps that protect are a state Address Confidentiality Program (`techsafety.org/address-confidentiality-programs`) and a trained advocate (National Domestic Violence Hotline, 1-800-799-7233, text START to 88788). Also said plainly: this tool keeps a list of brokers and screenshots on this computer; on a shared or monitored device that record is itself a risk.
3. **Use an email address kept only for opt-outs.** Every broker in section 2 asks for one. A separate address keeps the main one out of broker files and keeps confirmation links in one place.
4. **Only what the form requires.** The profile holds name, city, state, ZIP, email, phone and address, and `autoFillProfile` currently tries to fill all of them into anything that matches. Under the new contract an adapter declares the fields each step needs and receives only those; the orchestrator builds that reduced object, so an adapter cannot send a field it did not declare. `autoFillProfile` is removed. In the profile schema only name and email remain required. Date of birth, which PeopleConnect and FastPeopleSearch ask for, is never stored: the person types it into the broker's page themselves.

## 10. The vertical slice: Whitepages, end to end

**Why Whitepages.** Its opt-out page loaded in a normal browser with no challenge. Its first step asks for a profile URL and nothing else, so the flow is listing-first by the broker's own design, and the tool sends no personal detail the broker did not already publish. Verifying is re-loading that same address. An adapter and manifest entry already exist to replace. Its human step (a phone call) exercises the "stays human" path.

**Flow**

1. *Scan.* Open the Whitepages name search for the person's name and state in the visible window. Read the result cards into `Listing` values. If the page is blocked or does not look like a results page, return `unknown` and switch to the guided scan (person pastes their profile address).
2. *Confirm.* `chooseListings` shows the candidates. Nothing chosen: `not-found`, the suppression page is never opened.
3. *Request.* For each chosen listing: open `/suppression-requests`, enter the listing address (the only thing the tool types), press Next. The person completes the remaining steps: confirming the record, the reason, their phone number and the verification call. The tool waits, screenshots the confirmation, and records `requested` with `verifyAfter` three days out. If the person reports the call never came, the listing stays `listed` with `pending: "phone-call"`.
4. *Verify.* After the window: load the listing address, then repeat the scan. Gone and not in results: `removed`. Present: `listed`. Unreadable: `unknown`.
5. *Re-check.* At `nextCheckDue` the scan runs again. A listing found then: `relisted`.

The exact search address and the markup of result cards and of the "gone" page are not known from a read-only look. The first task of the slice is for a person to walk the live flow once in a visible browser and save cleaned copies of each page as fixtures, with every real name, address and phone number replaced by invented ones before anything is committed.

**Acceptance test.** `src/__tests__/whitepages.flow.test.ts`: vitest drives real Chromium (headless) against a small local HTTP server on `127.0.0.1` that serves `src/__tests__/fixtures/whitepages/*.html`. The adapter is constructed with that base address. A scripted fake `IOProvider` answers prompts. A fake clock sets "now". The state file and evidence folder are in a temporary directory. Automated tests never touch the live site.

| # | Given | Then |
|---|---|---|
| 1 | Search fixture with no results | State `not-found`. The server received no request for the suppression page. |
| 2 | Two candidates; the person picks the second | Exactly one suppression request; the only value typed is the second listing's address; state `requested`; `verifyAfter` is three days later; one evidence file exists. |
| 3 | Two candidates; the person picks none | State `not-found`; no request for the suppression page. |
| 4 | Case 2, then verify before the window | Nothing is loaded; state unchanged. |
| 5 | Case 2, clock moved four days, listing fixture now "not found" and search empty | State `removed`; `nextCheckDue` is 90 days later. |
| 6 | Case 5, clock moved 91 days, search fixture shows the listing again | State `relisted`; `timesRelisted` is 1. |
| 7 | Search fixture is a 403 challenge page | Scan result `unknown`, never `not-found`; the guided prompt is shown. |
| 8 | Any case | No profile field other than the listing address reaches the server (asserted on the recorded requests). State and evidence paths are matched by `.gitignore`. |

The slice is done when those cases pass, `npm run build` and `npm test` are green, and one person has completed a real Whitepages removal with it and seen `removed` after the window.

## 11. Build order

Vertical slice (in this order):

1. #37 State file and the six broker states
2. #38 Listing adapter contract, listing picker, and the scan-confirm-request path in the orchestrator
3. #39 Whitepages end to end with fixtures and the acceptance test

Queued behind the slice:

4. #40 Verify command and evidence folder for all listing adapters
5. #41 Re-check schedule; retire `--resume`
6. #42 Remove the stealth module; report bot walls as `unknown` (takes in #32)
7. #43 First-run guidance (DROP, Address Confidentiality Programs, dedicated email)
8. #44 Send only the fields a step requires (builds on #29)
9. #45 Desktop app: listing picker, broker states, due prompts, guidance screen
10. #46 PeopleConnect adapter
11. #47 Spokeo adapter
12. #48 BeenVerified adapter
13. #49 TruePeopleSearch and FastPeopleSearch adapters
14. #50 Long tail: guided-manual with recorded outcomes; separate checklist for non-people-search entries

## 12. Open questions for the owner

1. **Removing stealth** (section 8) makes the tool consistent with its README but means some brokers will need the guided path more often. Recommended: remove. Confirm, or say if a visible opt-in is wanted instead.
2. **Reminders.** The plan only tells the person what is due when they open the tool. Should the desktop app also raise an operating-system notification when a re-check falls due?
3. **Re-check interval default.** 90 days proposed, adjustable to 120. Should at-risk users get a shorter default (for example 30 days) when they say so in the first-run guidance?
4. **Date of birth.** Two of the six brokers ask for it. The plan never stores it and has the person type it. Acceptable, or should it be an optional profile field?
5. **Who does the live walk-through.** Each adapter needs one real pass through the broker's flow by a person with their own details, to capture fixtures and to confirm the flow. That cannot be done by an automated session.
6. **Sibling coverage.** Should the tool scan the sibling sites of each parent (for example TruthFinder after a PeopleConnect suppression) as part of verify, at the cost of more page loads per run?
7. **Evidence retention.** Keep screenshots indefinitely, or delete those older than a set age?
