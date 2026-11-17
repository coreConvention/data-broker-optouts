# Data Broker Opt-Out Runner

## Project Overview
Playwright-based tool that guides opt-out requests at 74 data broker and marketing opt-out pages (46 of them people-search sites) using a human-in-the-loop approach. Includes a CLI tool and a partially-built Electron + Angular 21 desktop app.

## Architecture
- **Entry point**: `src/run-refactored.ts` - orchestrates CLI parsing, config loading, browser setup, and execution
- **Adapters**: `src/adapters/BaseAdapter.ts` (abstract base) + 5 site-specific `BaseAdapter` walkthroughs in `sites/` + `GenericFormAdapter` for simple forms; `ListingAdapter.ts` (scan-first contract) + `sites/WhitepagesListingAdapter.ts`
- **Services**: `src/services/` - ConfigLoader, BrokerFilter, ResumeService, ExecutionOrchestrator, StatisticsTracker, StateStore
- **Factories**: `src/factories/` - AdapterFactory, BrowserFactory
- **Config**: `src/config/` - CLI parsing (yargs), Zod schemas for validation
- **Desktop**: `desktop/` - Electron main process + Angular 21 renderer with real engine integration
- **IOProvider**: `src/providers/` - Pluggable interface for human interaction (CliIOProvider, ElectronIOProvider)

## Key Patterns
- **Adapter Pattern**: Each data broker gets a BaseAdapter subclass. Generic brokers use manifest-driven selectors.
- **Factory Pattern**: AdapterFactory creates the right adapter based on `entry.adapter` field. BrowserFactory handles Chromium setup.
- **IOProvider Pattern**: Pluggable `IOProvider` interface abstracts human interaction — CLI uses readline, Electron uses IPC. Adapters call `ioProvider.waitForConfirmation()` / `ioProvider.promptUser()` instead of direct readline.
- **CJS/ESM Bridge**: Desktop main process (CJS) loads engine (ESM) via dynamic `await import()` from `desktop/dist/engine/`
- **Safe-by-default generic adapter**: `GenericFormAdapter` types and clicks only when the manifest entry has `verified: true` (absent means false) AND the live page passes its checks: the page text mentions opt-out/removal/suppression/deletion, and one single `<form>` holds every configured field plus a submit control whose label is not another form's (subscribe, search, sign in). Otherwise it types nothing, clicks nothing, and hands over through `ioProvider.waitForConfirmation` (find your listing first, finish by hand, plus the entry's `notes`). No manifest entry is verified yet, so every generic broker is guided-manual.
- **Adapter outcome**: `BaseAdapter.run` returns `"submitted" | "manual"` (`AdapterOutcome`); `execute` returning nothing means submitted. `ExecutionOrchestrator` records `manual` as `manual-needed`, never `success`, and a dry run does the same for an unverified generic entry.
- **Broker state file**: `StateStore` (`src/services/StateStore.ts`) keeps one of six states per broker (`unknown`, `not-found`, `listed`, `requested`, `removed`, `relisted`; `BrokerState` in `src/types.ts`, `StateFileSchema` in `src/config/schemas.ts`). The transitions are the pure functions `applyScan`, `applyRequest`, `applyVerify`. `StateStore.load` is the only way to get a store and throws `StateFileError` for a file it cannot read, so an unreadable file is never saved over; `save` writes a temp file then renames. The file carries a short hash of name, ZIP and email; entries written for a different person read as `unknown`. The CLI keeps it next to the profile, the desktop app under its data directory
- **Listing adapter (scan first)**: `ListingAdapter` (`src/adapters/ListingAdapter.ts`) is the second adapter contract: `findListings`, `requestRemoval`, `verifyRemoval`, plus `brokerId`, `removalWindowDays` and the profile `fields` each step may receive. `AdapterFactory.createListingAdapter(entry)` returns one or `null` (Whitepages only so far; `createAdapter` throws for it). When it returns one, `ExecutionOrchestrator.handleListingFlow` runs scan, then `chooseListings` (`src/utils/chooseListings.ts`: `IOProvider.selectListings` if the provider has it, else a numbered `promptUser` list; default nothing selected), then one `requestRemoval` per chosen listing, writing each outcome to the `StateStore` passed in as `ExecutionDependencies.stateStore`. `unknown` is never treated as `not-found`; `not-found` and "none chosen" send nothing; a dry run scans and asks but requests nothing and writes no state. Brokers without a listing adapter keep the `run()` path
- **Whitepages (first listing adapter)**: `WhitepagesListingAdapter` takes `baseUrl`, `evidenceDir` and `now` as constructor options. Scan opens `/name/First-Last/ST` and reads profile links; a refused, challenged or unrecognised page is `unknown` and becomes a guided scan (the person pastes their profile address or answers `none`). Request opens `/suppression-requests`, types the listing address into the one visible text box (the only value it ever types), presses Next, then asks the person to finish and answer `done`, `call` (verification call never came: stays `listed`, pending) or `skip`; `done` saves a screenshot under `<evidenceDir>/whitepages/`. `verifyRemoval` loads the listing address. **Its selectors and URL shapes (the `SITE` block) are unconfirmed against the live site**: they come from the design plan's description, and #39 stays open until a person has walked the live flow. `verifyBroker` (`src/services/VerifyPass.ts`) is the verify pass for one broker: nothing is loaded before `verifyAfter`; a listing is `removed` only when its address is gone and a repeat scan does not show it. No command calls it yet (#40)
- **Run-log status**: `OptOutResult.status` is `success | manual-needed | skipped | failed` for the older path plus the six broker states for listing-adapter brokers. Every result goes through `recordResult()`; messages carry counts only, never a listing address or summary. `StatisticsTracker.record(status)` counts each. The desktop main process maps broker states onto the renderer's existing badges (`RENDERER_STATUS` in `ElectronIOProvider.ts`) until the renderer learns them (#45)
- **BaseAdapter helpers**: `tryFillField()`, `tryFillStateField()`, `tryCheckBox()`, `autoFillProfile()`, `detectAndLogSuccess()` reduce duplication across site adapters
- **One-form auto-fill**: the site adapters' fill helpers type only inside the single `<form>` that could be the opt-out form, found by `BaseAdapter.findCandidateForms()` (the same per-form matching the generic adapter uses): it holds a wanted field, has a visible submit control, none of its submit controls reads subscribe / sign up / log in / search, and it has no password field. No such form, or more than one, means nothing is typed and a log line leaves the field to the person. Record-search steps (BeenVerified, Intelius) pass `{ allowSearchForm: true }`. Fill log lines name the field only, never the value typed.

## Tech Stack
- TypeScript 7 (strict mode, ES2022 target; the Angular renderer uses 5.9)
- Playwright for browser automation
- Zod 4 for schema validation
- yargs for CLI
- vitest for testing
- Electron 45 + Angular 21 for desktop (WIP)

## Data Files
- `data/manifest.json` - broker configurations (tracked in git). One entry per parent company; sites sharing an opt-out are listed in `notes`. Every entry has a `category` (`people-search`, `marketing`, `ad-tech`, `credit`, `b2b`); only `people-search` removes a public listing
- `data/profile.json` - user PII (gitignored, use `data/profile.example.json` as template)
- `data/state.json` - what the tool found, requested and verified at each broker (gitignored; listing addresses carry the person's name). Read and written only through `StateStore`. `data/evidence/` (gitignored) is for screenshots

## Commands
- `npm start` - run in headful mode
- `npm test` - run vitest suite
- `npm run build` - TypeScript type check
- `npm run start:dry-run` - test without submitting
- `npm run check:manifest` - read-only health check (`scripts/check-manifest.mjs`): loads every `removalUrl` headless, reports dead/blocked/redirected, never types or clicks, exits 1 on dead entries

## Adding a New Broker
1. Add entry to `data/manifest.json` (with a `category`, and a `removalUrl` you have loaded yourself) with selectors for generic adapter (set `verified: true` only after checking the selectors against the live opt-out page), OR
2. Create `src/adapters/sites/NewBrokerAdapter.ts` extending BaseAdapter
3. Register in `src/factories/AdapterFactory.ts`
4. Add adapter name to enum in `src/config/schemas.ts` and `src/types.ts`

## Temporary Files
- Use `.temp/` for screenshots, test artifacts, and any generated temp files
- `.temp/` is gitignored — never commit temp files to the repo

## Testing
- Tests in `src/__tests__/` using vitest (227 tests)
- Run output never carries a profile value: `ExecutionOrchestrator.test.ts` checks every dry-run log line, and the CLI start-up summary goes through `describeProfile` (`src/utils/profileSummary.ts`), which lists field names only
- Schema validation tests verify manifest.json integrity (every entry has a category; no two entries share a removalUrl)
- Service tests cover BrokerFilter, ResumeService, StatisticsTracker, AdapterFactory, ExecutionOrchestrator
- IOProvider tests cover interface contract and CliIOProvider implementation
- `GenericFormAdapter.test.ts` and `BaseAdapterAutoFill.test.ts` drive headless Chromium against local HTML fixtures (`page.setContent` / `data:` URLs), never a real site; they need Playwright's Chromium installed (`npx playwright install chromium`)
- `StateStore.test.ts` covers the state file: the transitions between the six broker states, round trip, refusal of an unreadable file, a changed person hash, the history cap, and `git check-ignore` on `data/state.json` and `data/evidence/`
- `ExecutionOrchestrator.listing.test.ts` drives the scan-confirm-request flow with a fake `ListingAdapter`, a scripted `IOProvider` and a real `StateStore` in a temp folder; the numbered-list fallback of `chooseListings` is tested in `CliIOProvider.test.ts`
- `whitepages.flow.test.ts` is the acceptance test for the Whitepages slice: headless Chromium, the real adapter, orchestrator, `verifyBroker` and state store against an HTTP server on 127.0.0.1 serving `src/__tests__/fixtures/whitepages/*.html`, with a scripted `IOProvider` and a clock passed in as `now`. After every case it checks that only the name search and the listing address reached the server. The fixtures are synthetic (invented people, markup written from the design plan, not captured from the site)
