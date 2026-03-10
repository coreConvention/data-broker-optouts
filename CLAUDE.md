# Data Broker Opt-Out Runner

## Project Overview
Playwright-based tool that automates opt-out requests from 113+ data broker sites using a human-in-the-loop approach. Includes a CLI tool and a partially-built Electron + Angular 19 desktop app.

## Architecture
- **Entry point**: `src/run-refactored.ts` - orchestrates CLI parsing, config loading, browser setup, and execution
- **Adapters**: `src/adapters/BaseAdapter.ts` (abstract base) + 7 site-specific adapters in `sites/` + `GenericFormAdapter` for simple forms
- **Services**: `src/services/` - ConfigLoader, BrokerFilter, ResumeService, ExecutionOrchestrator, StatisticsTracker
- **Factories**: `src/factories/` - AdapterFactory, BrowserFactory
- **Config**: `src/config/` - CLI parsing (yargs), Zod schemas for validation
- **Desktop**: `desktop/` - Electron main process + Angular 19 renderer (Phase 3 integration incomplete)

## Key Patterns
- **Adapter Pattern**: Each data broker gets a BaseAdapter subclass. Generic brokers use manifest-driven selectors.
- **Factory Pattern**: AdapterFactory creates the right adapter based on `entry.adapter` field. BrowserFactory handles Chromium setup.
- **Human-in-the-Loop**: `waitForEnter()` pauses for CAPTCHAs, email verification, manual steps
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

## Testing
- Tests in `src/__tests__/` using vitest
- Schema validation tests verify manifest.json integrity
- Service tests cover BrokerFilter, ResumeService, StatisticsTracker, AdapterFactory
