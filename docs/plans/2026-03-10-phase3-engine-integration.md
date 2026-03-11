# Phase 3: Engine Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the real ExecutionOrchestrator into the Electron desktop app, replacing the mock loop in `run.ipc.ts`, with pluggable IO for human interaction (modal or browser).

**Architecture:** Define an `IOProvider` interface in `src/types.ts` that abstracts human interaction and logging. `CliIOProvider` wraps existing readline functions for CLI. `ElectronIOProvider` routes through IPC for the desktop. Both plug into the orchestrator and adapters via dependency injection through the execution context.

**Tech Stack:** TypeScript, Playwright, Angular 19 signals, Electron 33 IPC, Zod, vitest

---

## Build Architecture Note

The desktop main process is **CommonJS** (`tsconfig.main.json: module: CommonJS`). The engine in `src/` is **ESM** (`package.json: type: module`, `.js` extension imports). To bridge this:

1. Add `tsconfig.engine.json` at root — compiles `src/` to ESM JS at `desktop/dist/engine/`
2. Desktop main process uses `await import()` to load compiled ESM engine modules
3. Add `@playwright/test` and `zod` to `desktop/package.json` dependencies
4. Update `desktop/package.json` build scripts to include engine build step

This is handled in Task 6.

---

### Task 1: IOProvider Interface & Types

**Files:**
- Modify: `src/types.ts:48` (after OptOutResult)

**Step 1: Write the failing test**

Create `src/__tests__/IOProvider.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { IOProvider, BrokerEntry } from "../types.js";

describe("IOProvider interface", () => {
  it("can be implemented with all required methods", () => {
    const mockProvider: IOProvider = {
      promptUser: vi.fn().mockResolvedValue("test-input"),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
    };

    expect(mockProvider.promptUser).toBeDefined();
    expect(mockProvider.waitForConfirmation).toBeDefined();
    expect(mockProvider.log).toBeDefined();
    expect(mockProvider.openExternal).toBeDefined();
    expect(mockProvider.shouldOpenInBrowser).toBeDefined();
  });

  it("promptUser returns a string", async () => {
    const mockProvider: IOProvider = {
      promptUser: vi.fn().mockResolvedValue("captcha-code"),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
    };

    const result = await mockProvider.promptUser("Enter code:");
    expect(result).toBe("captcha-code");
  });

  it("shouldOpenInBrowser reads humanInteraction field", () => {
    const browserBroker: BrokerEntry = {
      name: "Test",
      removalUrl: "https://example.com",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "browser",
    };

    const modalBroker: BrokerEntry = {
      name: "Test2",
      removalUrl: "https://example.com",
      requirements: ["online"],
      adapter: "generic",
    };

    const provider: IOProvider = {
      promptUser: vi.fn().mockResolvedValue(""),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: (broker) => broker.humanInteraction === "browser",
    };

    expect(provider.shouldOpenInBrowser(browserBroker)).toBe(true);
    expect(provider.shouldOpenInBrowser(modalBroker)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/IOProvider.test.ts`
Expected: FAIL — `IOProvider` type not exported, `humanInteraction` not on `BrokerEntry`

**Step 3: Add IOProvider interface and humanInteraction to types**

In `src/types.ts`, after the `OptOutResult` interface (line 55), add:

```typescript
export type HumanInteractionMode = "modal" | "browser";

export interface IOProvider {
  /** Prompt the user for text input (e.g., CAPTCHA code). Returns user's response. */
  promptUser(message: string, options?: { broker?: string }): Promise<string>;
  /** Pause execution until user confirms (e.g., "solve CAPTCHA then continue"). */
  waitForConfirmation(message: string, options?: { broker?: string; url?: string }): Promise<void>;
  /** Log a message to the appropriate output. */
  log(level: "info" | "warn" | "error" | "success", message: string): void;
  /** Open a URL in the system browser. */
  openExternal(url: string): Promise<void>;
  /** Check if a broker should open in external browser instead of in-app automation. */
  shouldOpenInBrowser(broker: BrokerEntry): boolean;
}
```

Also add `humanInteraction` to `BrokerEntry` (after `notes` field, line 21):

```typescript
humanInteraction?: HumanInteractionMode;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/IOProvider.test.ts`
Expected: PASS

**Step 5: Update Zod schema**

In `src/config/schemas.ts`, add to `BrokerEntrySchema` (after `notes` field, line 54):

```typescript
humanInteraction: z.enum(["modal", "browser"]).optional(),
```

**Step 6: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/types.ts src/config/schemas.ts src/__tests__/IOProvider.test.ts
git commit -m "feat: add IOProvider interface and humanInteraction to BrokerEntry"
```

---

### Task 2: CliIOProvider Implementation

**Files:**
- Create: `src/providers/CliIOProvider.ts`
- Create: `src/providers/index.ts`
- Test: `src/__tests__/CliIOProvider.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/CliIOProvider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CliIOProvider } from "../providers/CliIOProvider.js";
import type { BrokerEntry } from "../types.js";

// Mock the human.ts module
vi.mock("../utils/human.js", () => ({
  waitForEnter: vi.fn().mockResolvedValue(undefined),
  promptForCode: vi.fn().mockResolvedValue("test-code"),
}));

describe("CliIOProvider", () => {
  let provider: CliIOProvider;

  beforeEach(() => {
    provider = new CliIOProvider();
  });

  it("promptUser delegates to promptForCode", async () => {
    const { promptForCode } = await import("../utils/human.js");
    const result = await provider.promptUser("Enter code:");
    expect(promptForCode).toHaveBeenCalledWith("Enter code:");
    expect(result).toBe("test-code");
  });

  it("waitForConfirmation delegates to waitForEnter", async () => {
    const { waitForEnter } = await import("../utils/human.js");
    await provider.waitForConfirmation("Press Enter to continue");
    expect(waitForEnter).toHaveBeenCalledWith("Press Enter to continue");
  });

  it("log writes to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    provider.log("info", "test message");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shouldOpenInBrowser always returns false for CLI", () => {
    const broker: BrokerEntry = {
      name: "Test",
      removalUrl: "https://example.com",
      requirements: ["online"],
      adapter: "generic",
      humanInteraction: "browser",
    };
    expect(provider.shouldOpenInBrowser(broker)).toBe(false);
  });

  it("openExternal is a no-op", async () => {
    await expect(provider.openExternal("https://example.com")).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/CliIOProvider.test.ts`
Expected: FAIL — module not found

**Step 3: Implement CliIOProvider**

Create `src/providers/CliIOProvider.ts`:

```typescript
import type { IOProvider, BrokerEntry } from "../types.js";
import { waitForEnter, promptForCode } from "../utils/human.js";

export class CliIOProvider implements IOProvider {
  async promptUser(message: string): Promise<string> {
    return promptForCode(message);
  }

  async waitForConfirmation(message: string): Promise<void> {
    await waitForEnter(message);
  }

  log(level: "info" | "warn" | "error" | "success", message: string): void {
    const prefixes: Record<string, string> = {
      info: "",
      warn: "    ⚠ ",
      error: "    ✗ ",
      success: "    ✓ ",
    };
    console.log(`${prefixes[level]}${message}`);
  }

  async openExternal(_url: string): Promise<void> {
    // CLI doesn't open external URLs — the browser is already visible in headful mode
  }

  shouldOpenInBrowser(_broker: BrokerEntry): boolean {
    // CLI always uses Playwright directly, never external browser
    return false;
  }
}
```

Create `src/providers/index.ts`:

```typescript
export { CliIOProvider } from "./CliIOProvider.js";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/CliIOProvider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/CliIOProvider.ts src/providers/index.ts src/__tests__/CliIOProvider.test.ts
git commit -m "feat: add CliIOProvider wrapping existing readline interaction"
```

---

### Task 3: Refactor BaseAdapter to Accept IOProvider

**Files:**
- Modify: `src/adapters/BaseAdapter.ts`
- Modify: `src/types.ts` (add ExecutionContext type)
- Test: `src/__tests__/BaseAdapter.test.ts`

**Step 1: Add ExecutionContext to types**

In `src/types.ts`, after the `IOProvider` interface, add:

```typescript
export interface ExecutionContext {
  ioProvider: IOProvider;
}
```

**Step 2: Write the failing test**

Create `src/__tests__/BaseAdapter.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { IOProvider, BrokerEntry, PersonProfile, ExecutionContext } from "../types.js";

// We test that BaseAdapter passes ioProvider through correctly
// by checking the context is stored and accessible
describe("BaseAdapter with IOProvider", () => {
  it("run method accepts ExecutionContext parameter", async () => {
    // This test verifies the signature change compiles
    // The actual adapter tests will verify behavior
    const mockIO: IOProvider = {
      promptUser: vi.fn().mockResolvedValue(""),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
    };

    const context: ExecutionContext = { ioProvider: mockIO };
    expect(context.ioProvider).toBe(mockIO);
  });
});
```

**Step 3: Run test to verify it passes** (this is a type-level check)

Run: `npx vitest run src/__tests__/BaseAdapter.test.ts`
Expected: PASS (or FAIL if ExecutionContext not exported yet — add it first)

**Step 4: Refactor BaseAdapter**

In `src/adapters/BaseAdapter.ts`:

1. Add import: `import type { BrokerEntry, PersonProfile, IOProvider, ExecutionContext } from "../types.js";`
2. Add `protected ioProvider: IOProvider` field
3. Change `run()` signature to accept `ExecutionContext`:

```typescript
public async run(context: BrowserContext, profile: PersonProfile, execContext: ExecutionContext): Promise<void> {
    this.ioProvider = execContext.ioProvider;
    const page = await context.newPage();
    // ... rest unchanged
}
```

4. Change `execute()` signature:

```typescript
protected abstract execute(page: Page, profile: PersonProfile): Promise<void>;
// No change needed — adapters access this.ioProvider directly
```

5. Change the constructor to initialize ioProvider with a default no-op:

```typescript
protected ioProvider: IOProvider = {
    promptUser: async () => "",
    waitForConfirmation: async () => {},
    log: (level, msg) => console.log(msg),
    openExternal: async () => {},
    shouldOpenInBrowser: () => false,
};
```

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS (existing tests don't call `run()` directly)

**Step 6: Commit**

```bash
git add src/types.ts src/adapters/BaseAdapter.ts src/__tests__/BaseAdapter.test.ts
git commit -m "refactor: add IOProvider to BaseAdapter via ExecutionContext"
```

---

### Task 4: Update All Adapters to Use IOProvider

**Files:**
- Modify: `src/adapters/GenericFormAdapter.ts`
- Modify: `src/adapters/sites/SpokeoAdapter.ts`
- Modify: `src/adapters/sites/WhitepagesAdapter.ts`
- Modify: `src/adapters/sites/BeenVerifiedAdapter.ts`
- Modify: `src/adapters/sites/RadarisAdapter.ts`
- Modify: `src/adapters/sites/InteliusAdapter.ts`
- Modify: `src/adapters/sites/NuwberAdapter.ts`
- Modify: `src/adapters/sites/MyLifeAdapter.ts`

**Step 1: Update each adapter**

For each adapter, the change follows the same pattern:

1. **Remove** the `import { waitForEnter } from "..."` line
2. **Replace** every `waitForEnter(msg)` call with `this.ioProvider.waitForConfirmation(msg)`
3. **Replace** every `console.log(...)` with `this.ioProvider.log("info", ...)` (only for user-facing messages, not debug)

Example for `GenericFormAdapter.ts` (the template for all others):

**Before** (lines 4, 51-54, 65-67):
```typescript
import { waitForEnter } from "../utils/human.js";
// ...
await waitForEnter(`Site: ${this.entry.name}\nIf needed, solve CAPTCHA...`);
// ...
await waitForEnter(`Site: ${this.entry.name}\nComplete any email verification...`);
```

**After:**
```typescript
// Remove: import { waitForEnter } from "../utils/human.js";
// ...
await this.ioProvider.waitForConfirmation(
  `Site: ${this.entry.name}\nIf needed, solve CAPTCHA or upload ID in the browser window.`,
  { broker: this.entry.name, url: this.entry.removalUrl ?? undefined }
);
// ...
await this.ioProvider.waitForConfirmation(
  `Site: ${this.entry.name}\nComplete any email verification (click the link in your inbox). When done, return here.`,
  { broker: this.entry.name }
);
```

**Full list of changes per adapter:**

| Adapter | `waitForEnter` calls | `console.log` calls to convert |
|---|---|---|
| GenericFormAdapter.ts | 2 (lines 53, 66) | 0 |
| SpokeoAdapter.ts | 3 (lines 13, 31, 42) | 6 (lines 10-11, 23, 26, 50-51) |
| BeenVerifiedAdapter.ts | 4 (lines 28, 37, 49, 61) | 5 (lines 10-11, 46, 69-71) |
| WhitepagesAdapter.ts | similar pattern | similar |
| RadarisAdapter.ts | similar pattern | similar |
| InteliusAdapter.ts | similar pattern | similar |
| NuwberAdapter.ts | similar pattern | similar |
| MyLifeAdapter.ts | similar pattern | similar |

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/adapters/
git commit -m "refactor: replace waitForEnter with ioProvider in all adapters"
```

---

### Task 5: Refactor ExecutionOrchestrator to Use IOProvider

**Files:**
- Modify: `src/services/ExecutionOrchestrator.ts`
- Test: Verify existing tests still pass

**Step 1: Update ExecutionOrchestrator constructor**

In `src/services/ExecutionOrchestrator.ts`:

1. Add import: `import type { IOProvider, ExecutionContext } from "../types.js";`
2. Add `ioProvider` field and constructor parameter:

```typescript
export class ExecutionOrchestrator {
  private logger: Logger;
  private statistics: StatisticsTracker;
  private options: ExecutionOptions;
  private ioProvider: IOProvider;

  constructor(logger: Logger, options: ExecutionOptions, ioProvider: IOProvider) {
    this.logger = logger;
    this.statistics = new StatisticsTracker();
    this.options = options;
    this.ioProvider = ioProvider;
  }
```

3. Update `handleActualExecution` to pass context (line 166-180):

```typescript
private async handleActualExecution(
    entry: BrokerEntry,
    profile: PersonProfile,
    context: BrowserContext,
    result: OptOutResult
): Promise<void> {
    const adapter = AdapterFactory.createAdapter(entry);
    const execContext: ExecutionContext = { ioProvider: this.ioProvider };
    await adapter.run(context, profile, execContext);

    result.status = "success";
    result.message = "Submitted (some steps may have been manual).";
    await this.logger.append(result);
    this.statistics.recordSuccess();
    this.ioProvider.log("success", `${entry.name}: ${result.message}`);
}
```

4. Replace `console.log` calls with `this.ioProvider.log()` for user-facing messages:
   - `printBrokerHeader` → `this.ioProvider.log("info", ...)`
   - `handleSkippedBroker` → `this.ioProvider.log("warn", ...)`
   - `handleManualOnlyBroker` → `this.ioProvider.log("warn", ...)`
   - `handleDryRun` → `this.ioProvider.log("info", ...)`
   - `handleExecutionError` → `this.ioProvider.log("error", ...)`
   - `delayBetweenBrokers` → `this.ioProvider.log("info", ...)`

**Step 2: Update CLI runner**

In `src/run-refactored.ts`, update Step 12 (line 89-92):

```typescript
import { CliIOProvider } from "./providers/index.js";
// ...
const ioProvider = new CliIOProvider();
const orchestrator = new ExecutionOrchestrator(logger, {
  dryRun: cliOptions.dryRun,
  delayBetweenBrokers: 2000
}, ioProvider);
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 4: Verify CLI still works**

Run: `npx tsx src/run-refactored.ts --manifest ./data/manifest.json --profile ./data/profile.json --dry-run --limit 3`
Expected: Dry run completes for 3 brokers with console output

**Step 5: Commit**

```bash
git add src/services/ExecutionOrchestrator.ts src/run-refactored.ts
git commit -m "refactor: wire IOProvider through ExecutionOrchestrator to adapters"
```

---

### Task 6: Desktop Build Pipeline for Engine

**Files:**
- Create: `tsconfig.engine.json` (at project root)
- Modify: `desktop/package.json` (add engine build step, add dependencies)
- Modify: `desktop/tsconfig.main.json` (add path mapping for engine)

**Step 1: Create engine tsconfig**

Create `tsconfig.engine.json` at project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "desktop/dist/engine",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/__tests__/**"]
}
```

**Step 2: Add dependencies to desktop**

In `desktop/package.json`, add to `dependencies`:

```json
"@playwright/test": "^1.46.0",
"zod": "^3.23.8"
```

**Step 3: Update build scripts**

In `desktop/package.json`, update scripts:

```json
"build:engine": "cd .. && tsc -p tsconfig.engine.json",
"build": "npm run build:engine && npm run build:renderer && npm run build:main",
"dev:electron": "npm run build:engine && npx wait-on http://localhost:4200 && npm run build:main && npx electron ."
```

**Step 4: Verify engine builds**

Run: `cd desktop && npm run build:engine`
Expected: Compiled JS files appear in `desktop/dist/engine/`

**Step 5: Install new dependencies**

Run: `cd desktop && npm install`

**Step 6: Commit**

```bash
git add tsconfig.engine.json desktop/package.json desktop/tsconfig.main.json
git commit -m "build: add engine compilation pipeline for desktop"
```

---

### Task 7: ElectronIOProvider Implementation

**Files:**
- Create: `desktop/main/providers/ElectronIOProvider.ts`

**Step 1: Create ElectronIOProvider**

Create `desktop/main/providers/ElectronIOProvider.ts`:

```typescript
import { BrowserWindow, shell } from 'electron';

// Match the IOProvider interface shape from src/types.ts
// We use structural typing — no direct import needed from ESM module

interface BrokerEntry {
  name: string;
  humanInteraction?: 'modal' | 'browser';
  removalUrl?: string | null;
  [key: string]: unknown;
}

type LogLevel = 'info' | 'warn' | 'error' | 'success';

function sendToWindow(
  getWindow: () => BrowserWindow | null,
  channel: string,
  data: unknown
): void {
  const window = getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

export class ElectronIOProvider {
  private getMainWindow: () => BrowserWindow | null;
  private humanInputResolver: ((value: string) => void) | null = null;
  private confirmationResolver: (() => void) | null = null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  async promptUser(message: string, options?: { broker?: string }): Promise<string> {
    return new Promise<string>((resolve) => {
      this.humanInputResolver = resolve;
      sendToWindow(this.getMainWindow, 'run:human-input', {
        type: 'prompt',
        message,
        broker: options?.broker ?? null,
      });
    });
  }

  async waitForConfirmation(
    message: string,
    options?: { broker?: string; url?: string }
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.confirmationResolver = () => resolve();
      this.humanInputResolver = () => {
        this.confirmationResolver = null;
        resolve();
      };

      sendToWindow(this.getMainWindow, 'run:human-input', {
        type: 'confirmation',
        message,
        broker: options?.broker ?? null,
        url: options?.url ?? null,
      });
    });
  }

  log(level: LogLevel, message: string): void {
    const prefixes: Record<LogLevel, string> = {
      info: '',
      warn: '⚠ ',
      error: '✗ ',
      success: '✓ ',
    };
    sendToWindow(
      this.getMainWindow,
      'run:log',
      `${prefixes[level]}${message}`
    );
  }

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  shouldOpenInBrowser(broker: BrokerEntry): boolean {
    return broker.humanInteraction === 'browser';
  }

  /** Called by IPC handler when user responds to a human-input prompt */
  resolveHumanInput(response: string): void {
    if (this.humanInputResolver) {
      this.humanInputResolver(response);
      this.humanInputResolver = null;
    }
  }
}
```

**Step 2: Build and verify**

Run: `cd desktop && npm run build:main`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add desktop/main/providers/ElectronIOProvider.ts
git commit -m "feat: add ElectronIOProvider for IPC-based human interaction"
```

---

### Task 8: Replace Mock Loop in run.ipc.ts

**Files:**
- Modify: `desktop/main/ipc/run.ipc.ts` (major rewrite of lines 56-258)

**Step 1: Rewrite run.ipc.ts**

Replace the entire `run:start` handler with the real orchestrator integration. Key changes:

1. Import `ElectronIOProvider`
2. Dynamic `import()` to load compiled ESM engine modules
3. Create browser via BrowserFactory, orchestrator via ExecutionOrchestrator
4. Wire pause/stop/resume to orchestrator
5. Remove all mock simulation code

```typescript
import { IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDataPath } from './config.ipc';
import { ElectronIOProvider } from '../providers/ElectronIOProvider';

interface RunOptions {
  headful?: boolean;
  stealth?: boolean;
  dryRun?: boolean;
  filter?: string[];
  exclude?: string[];
  limit?: number;
}

interface ProgressData {
  current: number;
  total: number;
  broker: string;
  status: 'pending' | 'processing' | 'captcha' | 'manual' | 'success' | 'failed' | 'skipped';
  message?: string;
}

interface CompleteData {
  success: number;
  failed: number;
  skipped: number;
  manual: number;
  total: number;
  logFile: string;
}

// State
let isRunning = false;
let isPaused = false;
let shouldStop = false;
let electronIOProvider: ElectronIOProvider | null = null;

function sendToWindow(
  getWindow: () => BrowserWindow | null,
  channel: string,
  data: unknown
): void {
  const window = getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

export function registerRunHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null
): void {

  ipcMain.handle('run:start', async (_event, options: RunOptions): Promise<void> => {
    if (isRunning) {
      throw new Error('A run is already in progress');
    }

    isRunning = true;
    isPaused = false;
    shouldStop = false;

    // Resolve engine path — compiled ESM modules in dist/engine/
    const engineBase = path.join(__dirname, '../engine');

    let browser: unknown = null;
    let context: unknown = null;

    try {
      // Dynamic import of compiled ESM engine modules
      const { BrowserFactory } = await import(
        /* webpackIgnore: true */
        path.join(engineBase, 'factories/BrowserFactory.js')
      );
      const { ExecutionOrchestrator } = await import(
        /* webpackIgnore: true */
        path.join(engineBase, 'services/ExecutionOrchestrator.js')
      );
      const { Logger } = await import(
        /* webpackIgnore: true */
        path.join(engineBase, 'utils/logger.js')
      );
      const { ConfigLoader } = await import(
        /* webpackIgnore: true */
        path.join(engineBase, 'services/ConfigLoader.js')
      );
      const { BrokerFilter } = await import(
        /* webpackIgnore: true */
        path.join(engineBase, 'services/BrokerFilter.js')
      );

      const dataPath = getDataPath();
      const manifestPath = path.join(dataPath, 'manifest.json');
      const profilePath = path.join(dataPath, 'profile.json');

      // Validate files exist
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest file not found. Please check your data directory.');
      }
      if (!fs.existsSync(profilePath)) {
        throw new Error('Profile file not found. Please create a profile first.');
      }

      // Load and validate via engine's ConfigLoader
      const { manifest, profile } = await ConfigLoader.loadAll(manifestPath, profilePath);

      // Apply filters
      let brokers = BrokerFilter.filter(
        manifest,
        options.filter ? options.filter.join(',') : undefined,
        options.exclude ? options.exclude.join(',') : undefined
      );
      if (options.limit && options.limit > 0) {
        brokers = BrokerFilter.limit(brokers, options.limit);
      }

      const total = brokers.length;
      if (total === 0) {
        throw new Error('No brokers to process after filtering.');
      }

      // Setup logger
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(dataPath, `optouts-${timestamp}.jsonl`);
      const logger = new Logger(dataPath, `optouts-${timestamp}.jsonl`);

      // Create IO provider
      electronIOProvider = new ElectronIOProvider(getMainWindow);

      sendToWindow(getMainWindow, 'run:log', `Starting opt-out process for ${total} brokers...`);

      // Create browser
      const browserResult = await BrowserFactory.createBrowserWithContext({
        headful: options.headful ?? true,
        stealth: options.stealth ?? true,
      });
      browser = browserResult.browser;
      context = browserResult.context;

      // Create orchestrator with progress callback
      const orchestrator = new ExecutionOrchestrator(logger, {
        dryRun: options.dryRun ?? false,
        delayBetweenBrokers: 2000,
      }, electronIOProvider);

      // Execute with stop/pause awareness
      // Note: The orchestrator processes sequentially. We check shouldStop
      // between brokers via a wrapper that respects the flags.
      await orchestrator.executeAll(brokers, profile, context as any);

      // Get statistics
      const stats = orchestrator.getStatistics().getStatistics();

      // Send completion
      const completeData: CompleteData = {
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
        manual: stats.manualNeeded,
        total,
        logFile: logger.path(),
      };
      sendToWindow(getMainWindow, 'run:complete', completeData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      sendToWindow(getMainWindow, 'run:log', `Fatal error: ${errorMessage}`);
      // Send completion with all failed
      sendToWindow(getMainWindow, 'run:complete', {
        success: 0, failed: 0, skipped: 0, manual: 0, total: 0,
        logFile: '',
      });
      throw error;
    } finally {
      // Cleanup
      try {
        if (context && typeof (context as any).close === 'function') {
          await (context as any).close();
        }
        if (browser && typeof (browser as any).close === 'function') {
          await (browser as any).close();
        }
      } catch {}

      isRunning = false;
      isPaused = false;
      shouldStop = false;
      electronIOProvider = null;
    }
  });

  // Stop
  ipcMain.handle('run:stop', async (): Promise<void> => {
    if (!isRunning) return;
    shouldStop = true;
    sendToWindow(getMainWindow, 'run:log', 'Stopping run...');
  });

  // Pause
  ipcMain.handle('run:pause', async (): Promise<void> => {
    if (!isRunning || isPaused) return;
    isPaused = true;
    sendToWindow(getMainWindow, 'run:log', 'Run paused.');
  });

  // Resume
  ipcMain.handle('run:resume', async (): Promise<void> => {
    if (!isRunning || !isPaused) return;
    isPaused = false;
    sendToWindow(getMainWindow, 'run:log', 'Run resumed.');
  });

  // Status
  ipcMain.handle('run:status', async (): Promise<{ isRunning: boolean; isPaused: boolean }> => {
    return { isRunning, isPaused };
  });

  // Human input response
  ipcMain.handle('run:human-input-response', async (_event, response: string): Promise<void> => {
    if (electronIOProvider) {
      electronIOProvider.resolveHumanInput(response);
    }
  });
}
```

**Step 2: Build desktop**

Run: `cd desktop && npm run build:engine && npm run build:main`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add desktop/main/ipc/run.ipc.ts
git commit -m "feat: replace mock loop with real ExecutionOrchestrator in run.ipc.ts"
```

---

### Task 9: HumanInputModal Angular Component

**Files:**
- Create: `desktop/renderer/src/app/shared/components/human-input-modal/human-input-modal.component.ts`

**Step 1: Create the modal component**

```typescript
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunService } from '../../../core/services/run.service';
import { ElectronService } from '../../../core/services/electron.service';

@Component({
  selector: 'app-human-input-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h2>Action Required</h2>
            @if (brokerName()) {
              <span class="broker-tag">{{ brokerName() }}</span>
            }
          </div>

          <div class="modal-body">
            <pre class="prompt-text">{{ promptMessage() }}</pre>
          </div>

          @if (promptUrl()) {
            <div class="browser-action">
              <button class="btn btn-accent" (click)="openInBrowser()">
                Open in Browser
              </button>
              <p class="hint">Complete the steps in your browser, then click Continue below.</p>
            </div>
          }

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="skip()">
              Skip
            </button>
            <button class="btn btn-primary" (click)="confirm()">
              Continue
            </button>
          </div>

          <div class="timeout-bar">
            <div class="timeout-fill"></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }

    .modal-content {
      background: var(--bg-card);
      border: 1px solid var(--border-active);
      border-radius: var(--radius-lg);
      box-shadow: 0 0 40px rgba(14, 165, 233, 0.15);
      width: 90%;
      max-width: 520px;
      overflow: hidden;
      animation: slideUp 0.25s ease;
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-color);

      .modal-icon {
        color: var(--color-primary);
        display: flex;
        align-items: center;
      }

      h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        flex: 1;
      }

      .broker-tag {
        padding: 0.2rem 0.5rem;
        background: var(--color-primary-glow);
        color: var(--color-primary);
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
        text-transform: uppercase;
      }
    }

    .modal-body {
      padding: 1.25rem 1.5rem;
    }

    .prompt-text {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.7;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'DM Sans', sans-serif;
    }

    .browser-action {
      padding: 0 1.5rem 1rem;
      text-align: center;

      .hint {
        margin: 0.5rem 0 0;
        font-size: 0.6875rem;
        color: var(--text-muted);
      }
    }

    .btn-accent {
      background: rgba(14, 165, 233, 0.15);
      color: var(--color-primary);
      border: 1px solid var(--color-primary);
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 600;
      font-size: 0.8125rem;
      transition: all 0.2s;
      &:hover { background: rgba(14, 165, 233, 0.25); }
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .timeout-bar {
      height: 3px;
      background: var(--bg-secondary);

      .timeout-fill {
        height: 100%;
        background: var(--color-primary);
        width: 100%;
        animation: countdown 600s linear forwards;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    @keyframes countdown {
      from { width: 100%; }
      to { width: 0%; }
    }
  `]
})
export class HumanInputModalComponent {
  private runService = inject(RunService);
  private electronService = inject(ElectronService);

  private prompt = this.electronService.humanInputPrompt;

  protected isVisible = computed(() => this.prompt() !== null);

  protected promptMessage = computed(() => {
    const p = this.prompt();
    if (!p) return '';
    // Handle both string and object prompts
    if (typeof p === 'string') return p;
    return (p as any).message ?? '';
  });

  protected brokerName = computed(() => {
    const p = this.prompt();
    if (!p || typeof p === 'string') return null;
    return (p as any).broker ?? null;
  });

  protected promptUrl = computed(() => {
    const p = this.prompt();
    if (!p || typeof p === 'string') return null;
    return (p as any).url ?? null;
  });

  confirm(): void {
    this.runService.submitHumanInput('continue');
  }

  skip(): void {
    this.runService.submitHumanInput('skip');
  }

  async openInBrowser(): Promise<void> {
    const url = this.promptUrl();
    if (url) {
      await this.electronService.openExternal(url);
    }
  }

  onOverlayClick(event: Event): void {
    // Don't close on overlay click — user must explicitly choose
    event.stopPropagation();
  }
}
```

**Step 2: Update ElectronService to handle object-typed prompts**

In `desktop/renderer/src/app/core/services/electron.service.ts`, line 133, change the signal type:

```typescript
readonly humanInputPrompt = signal<string | Record<string, unknown> | null>(null);
```

And update `setupListeners` (line 182) to accept both:

```typescript
const cleanupHuman = this.api.run.onHumanInput((prompt: string | Record<string, unknown>) => {
  this.ngZone.run(() => this.humanInputPrompt.set(prompt));
});
```

**Step 3: Add modal to app.component.ts**

In `desktop/renderer/src/app/app.component.ts`, add to imports array:

```typescript
import { HumanInputModalComponent } from './shared/components/human-input-modal/human-input-modal.component';
// In @Component imports:
imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, HumanInputModalComponent],
```

Add to template (after the router-outlet):

```html
<app-human-input-modal />
```

**Step 4: Build renderer**

Run: `cd desktop/renderer && npx ng build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add desktop/renderer/src/app/shared/components/human-input-modal/
git add desktop/renderer/src/app/core/services/electron.service.ts
git add desktop/renderer/src/app/app.component.ts
git commit -m "feat: add HumanInputModal component for in-app interaction prompts"
```

---

### Task 10: Update Preload Script for Object Prompts

**Files:**
- Modify: `desktop/main/preload.ts` (update `onHumanInput` type)

**Step 1: Update type**

In `desktop/main/preload.ts`, update the `onHumanInput` callback signature (line 100-103) and the `Window` type declaration (line 188) to accept `string | object`:

```typescript
onHumanInput: (callback: (prompt: string | Record<string, unknown>) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, prompt: string | Record<string, unknown>) => callback(prompt);
  ipcRenderer.on('run:human-input', listener);
  return () => ipcRenderer.removeListener('run:human-input', listener);
},
```

**Step 2: Build desktop**

Run: `cd desktop && npm run build:main`
Expected: No errors

**Step 3: Commit**

```bash
git add desktop/main/preload.ts
git commit -m "fix: update preload to support object-typed human-input prompts"
```

---

### Task 11: Add humanInteraction to Select Manifest Brokers

**Files:**
- Modify: `data/manifest.json`

**Step 1: Identify brokers that need browser mode**

Add `"humanInteraction": "browser"` to brokers known to have aggressive anti-automation:
- Spokeo (CAPTCHA + aggressive bot detection)
- BeenVerified (fingerprinting)
- Radaris (Cloudflare)
- MyLife (aggressive bot detection)

For all other brokers, leave the field absent (defaults to `"modal"`).

**Step 2: Update manifest entries**

For each broker above, add the field. Example:

```json
{
  "name": "Spokeo",
  "removalUrl": "https://www.spokeo.com/optout",
  "requirements": ["online", "captcha", "email-verification"],
  "adapter": "Spokeo",
  "humanInteraction": "browser",
  "notes": "Search for your listing, then request removal"
}
```

**Step 3: Run schema validation test**

Run: `npx vitest run src/__tests__/manifest.test.ts`
Expected: PASS (schema now accepts `humanInteraction`)

**Step 4: Commit**

```bash
git add data/manifest.json
git commit -m "data: add humanInteraction field to brokers with anti-automation"
```

---

### Task 12: Add Stop/Pause Support to ExecutionOrchestrator

**Files:**
- Modify: `src/services/ExecutionOrchestrator.ts`

Currently the orchestrator has no mechanism for external stop/pause signals. We need to add this so the desktop's stop/pause buttons work.

**Step 1: Add control interface**

Add to `ExecutionOrchestrator`:

```typescript
private shouldStop = false;
private isPaused = false;

public requestStop(): void {
  this.shouldStop = true;
}

public requestPause(): void {
  this.isPaused = true;
}

public requestResume(): void {
  this.isPaused = false;
}

private async checkPauseAndStop(): Promise<boolean> {
  while (this.isPaused && !this.shouldStop) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return this.shouldStop;
}
```

**Step 2: Integrate into executeAll loop**

Update the `for` loop in `executeAll` (line 46-58):

```typescript
for (let i = 0; i < brokers.length; i++) {
  if (await this.checkPauseAndStop()) {
    this.ioProvider.log("warn", "Run stopped by user.");
    break;
  }

  const entry = brokers[i]!;
  const brokerNum = i + 1;

  this.printBrokerHeader(entry, brokerNum, totalBrokers);
  await this.executeBroker(entry, profile, context);

  if (i < brokers.length - 1) {
    await this.delayBetweenBrokers();
  }
}
```

**Step 3: Update run.ipc.ts to use orchestrator stop/pause**

Store orchestrator reference and call its methods from the IPC handlers instead of just setting flags.

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/services/ExecutionOrchestrator.ts desktop/main/ipc/run.ipc.ts
git commit -m "feat: add stop/pause/resume control to ExecutionOrchestrator"
```

---

### Task 13: End-to-End Verification

**Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All PASS

**Step 2: Verify CLI still works**

Run: `npx tsx src/run-refactored.ts --manifest ./data/manifest.json --profile ./data/profile.json --dry-run --limit 3`
Expected: Dry run completes, output shows via CliIOProvider

**Step 3: Build desktop app**

Run: `cd desktop && npm run build`
Expected: Engine, renderer, and main all compile

**Step 4: Test desktop app in dev mode**

Run: `cd desktop && npm run dev`
Expected:
- App launches
- Dashboard displays broker count
- Start a dry run — real orchestrator processes brokers
- Progress updates appear in log viewer
- Completion event fires when done

**Step 5: Test human interaction modal**

- Start a run with a broker that has CAPTCHA requirements
- HumanInputModal should appear with instructions
- Click "Continue" or "Skip" — run continues

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3 complete — engine integration with desktop app"
```
