# Phase 3: Engine Integration Design

**Date:** 2026-03-10
**Status:** Approved
**Approach:** C — Pluggable IOProvider Interface

## Problem

The desktop app's `run.ipc.ts` has a mock loop that simulates broker processing. The real `ExecutionOrchestrator` and adapter system only works via CLI with readline-based human interaction. We need to wire the real engine into the Electron app while supporting two human interaction modes: in-app modal and external browser.

## Architecture

### IOProvider Interface

```typescript
// src/types.ts
interface IOProvider {
  promptUser(message: string, options?: { broker?: string }): Promise<string>;
  waitForConfirmation(message: string, options?: { broker?: string; url?: string }): Promise<void>;
  log(level: 'info' | 'warn' | 'error' | 'success', message: string): void;
  openExternal(url: string): Promise<void>;
  shouldOpenInBrowser(broker: BrokerEntry): boolean;
}
```

### Implementations

**CliIOProvider** — wraps existing `human.ts` readline functions. No behavioral change for CLI users.

**ElectronIOProvider** — routes through IPC:
- `promptUser` → `run:human-input` IPC event, awaits `run:human-input-response`
- `waitForConfirmation` → checks `shouldOpenInBrowser()`:
  - Modal path: sends IPC message, waits for "Continue" click
  - Browser path: `shell.openExternal(url)`, sends IPC with "Complete in browser, then Continue"
- `log` → `sendToWindow('run:log', message)`
- `shouldOpenInBrowser` → reads `broker.humanInteraction === 'browser'`

### Manifest Schema Change

Add optional field to `BrokerEntry` in `src/config/schemas.ts`:

```typescript
humanInteraction: z.enum(['modal', 'browser']).optional().default('modal')
```

Brokers with aggressive anti-automation (Cloudflare, fingerprinting) get `"humanInteraction": "browser"`. Default is `"modal"` (in-app Playwright automation with modal dialogs for manual steps).

## Integration Points

### 1. Engine Refactoring

- `BaseAdapter` constructor/context gains `ioProvider: IOProvider`
- Replace all `waitForEnter()` calls with `ioProvider.waitForConfirmation()`
- Replace all `promptForCode()` calls with `ioProvider.promptUser()`
- `ExecutionOrchestrator` accepts `IOProvider`, passes through execution context
- `human.ts` remains as utility; `CliIOProvider` wraps it

### 2. run.ipc.ts Replacement

Replace mock loop (current lines 124-231) with:
1. Create browser/context via `BrowserFactory` using settings from run options
2. Create `ElectronIOProvider` with `getMainWindow` reference
3. Instantiate `ExecutionOrchestrator` with `ElectronIOProvider`
4. Call `orchestrator.executeAll()` with progress callback mapping to `sendToWindow`
5. Clean up browser/context in finally block

Existing IPC plumbing preserved:
- `run:stop` → sets orchestrator's stop flag
- `run:pause` / `run:resume` → sets orchestrator's pause flag
- `run:human-input` / `run:human-input-response` → used by `ElectronIOProvider`

### 3. Renderer UI — HumanInputModal

New `HumanInputModalComponent`:
- Overlay modal triggered by `run:human-input` event
- Shows broker name, instruction message
- "Continue" button sends response back via `run:human-input-response`
- For browser-mode brokers: "Open in Browser" button + instructional checklist
- 10-minute timeout auto-skips with warning

`RunService` additions:
- Listen for `run:human-input` event
- Expose signal for modal state
- Method to send response

### 4. Progress Event Flow

```
ExecutionOrchestrator
  → progress callback(broker, status, message)
    → ElectronIOProvider.log()
      → sendToWindow('run:progress', data)
      → sendToWindow('run:log', formatted message)
        → Renderer RunService
          → Dashboard/LogViewer update via signals
```

## Error Handling

| Scenario | Handling |
|---|---|
| Playwright fails to launch | Catch at IPC level, send error to renderer, clean state |
| User closes app during run | BrowserWindow close handler triggers graceful stop |
| Browser-mode broker timeout | 10-min timeout on waitForConfirmation, auto-skip with warning |
| Adapter throws | Caught by orchestrator, logged as failed, continues to next |
| IPC channel disconnected | ElectronIOProvider checks window existence before sending |

## Files Modified

| File | Change |
|---|---|
| `src/types.ts` | Add `IOProvider` interface, add `humanInteraction` to `BrokerEntry` |
| `src/config/schemas.ts` | Add `humanInteraction` to Zod schema |
| `src/adapters/BaseAdapter.ts` | Accept `IOProvider` in context, replace human.ts calls |
| `src/adapters/sites/SpokeoAdapter.ts` | Use `ioProvider` instead of direct human.ts imports |
| `src/adapters/sites/*.ts` | Same pattern for any adapter using human.ts |
| `src/services/ExecutionOrchestrator.ts` | Accept `IOProvider`, pass to adapter context |
| `src/run-refactored.ts` | Create `CliIOProvider`, pass to orchestrator |
| `src/providers/CliIOProvider.ts` | New file — CLI implementation |
| `src/providers/ElectronIOProvider.ts` | New file — Electron implementation |
| `desktop/main/ipc/run.ipc.ts` | Replace mock loop with real orchestrator |
| `desktop/renderer/.../run.service.ts` | Add human-input event handling |
| `desktop/renderer/.../human-input-modal.component.ts` | New component |
| `data/manifest.json` | Add `humanInteraction` field to select brokers |
| Tests | Update existing, add IOProvider tests |

## Out of Scope

- Per-broker browser override UI in settings (future enhancement)
- Retry failed brokers from UI (future enhancement)
- Parallel broker execution (future enhancement)
