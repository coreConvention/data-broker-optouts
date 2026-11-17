# Data Broker Opt-Out Runner

## Project Overview
Playwright-based tool that automates opt-out requests from 113+ data broker sites using a human-in-the-loop approach. Includes a CLI tool and a partially-built Electron + Angular 19 desktop app.

## Architecture
- **Entry point**: `src/run-refactored.ts` - orchestrates CLI parsing, config loading, browser setup, and execution
- **Adapters**: `src/adapters/BaseAdapter.ts` (abstract base) + 7 site-specific adapters in `sites/` + `GenericFormAdapter` for simple forms
- **Services**: `src/services/` - ConfigLoader, BrokerFilter, ResumeService, ExecutionOrchestrator, StatisticsTracker
- **Factories**: `src/factories/` - AdapterFactory, BrowserFactory
- **Config**: `src/config/` - CLI parsing (yargs), Zod schemas for validation
- **Desktop**: `desktop/` - Electron main process + Angular 19 renderer with real engine integration
- **IOProvider**: `src/providers/` - Pluggable interface for human interaction (CliIOProvider, ElectronIOProvider)

## Key Patterns
- **Adapter Pattern**: Each data broker gets a BaseAdapter subclass. Generic brokers use manifest-driven selectors.
- **Factory Pattern**: AdapterFactory creates the right adapter based on `entry.adapter` field. BrowserFactory handles Chromium setup.
- **IOProvider Pattern**: Pluggable `IOProvider` interface abstracts human interaction — CLI uses readline, Electron uses IPC. Adapters call `ioProvider.waitForConfirmation()` / `ioProvider.promptUser()` instead of direct readline.
- **CJS/ESM Bridge**: Desktop main process (CJS) loads engine (ESM) via dynamic `await import()` from `desktop/dist/engine/`
- **BaseAdapter helpers**: `tryFillField()`, `autoFillProfile()`, `detectAndLogSuccess()` reduce duplication across site adapters

## Tech Stack
- TypeScript 5.5 (strict mode, ES2022 target)
- Playwright for browser automation
- Zod for schema validation
- yargs for CLI
- vitest for testing
- Electron 33 + Angular 19 for desktop (WIP)

## Data Files
- `data/manifest.json` - broker configurations (tracked in git)
- `data/profile.json` - user PII (gitignored, use `data/profile.example.json` as template)

## Commands
- `npm start` - run in headful mode
- `npm test` - run vitest suite
- `npm run build` - TypeScript type check
- `npm run start:dry-run` - test without submitting

## Adding a New Broker
1. Add entry to `data/manifest.json` with selectors for generic adapter, OR
2. Create `src/adapters/sites/NewBrokerAdapter.ts` extending BaseAdapter
3. Register in `src/factories/AdapterFactory.ts`
4. Add adapter name to enum in `src/config/schemas.ts` and `src/types.ts`

## Temporary Files
- Use `.temp/` for screenshots, test artifacts, and any generated temp files
- `.temp/` is gitignored — never commit temp files to the repo

## Testing
- Tests in `src/__tests__/` using vitest (92 tests)
- Schema validation tests verify manifest.json integrity
- Service tests cover BrokerFilter, ResumeService, StatisticsTracker, AdapterFactory, ExecutionOrchestrator
- IOProvider tests cover interface contract and CliIOProvider implementation
