# Cross-Platform Native UI Plan

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | Electron | Full Node.js/Playwright support, max code reuse |
| **UI Framework** | Angular 19 | Leverage Angular MCP server, familiar stack |
| **Distribution** | GitHub Releases | Open source project, direct downloads |
| **App Auto-Update** | Nice-to-have | Use electron-updater if time permits |
| **Manifest Auto-Update** | Priority | Fetch latest broker list from GitHub |
| **Mobile Support** | Future consideration | Desktop-first, mobile can be added later |

---

## Current State

The data-broker-optouts project is a **CLI-based** Node.js/TypeScript application using:
- **Playwright** for browser automation
- **yargs** for CLI argument parsing
- **Zod** for schema validation
- **Terminal output** for progress/status display

Users interact via command line (`npm start`, flags like `--headful`, `--filter`, etc.)

---

## Goal

Create a cross-platform native desktop application that:
1. Provides a GUI for managing opt-out workflows
2. Displays real-time progress and status
3. Allows easy profile/manifest configuration
4. Works on Windows, macOS, and Linux
5. Leverages the existing TypeScript codebase
6. Auto-updates the manifest.json from GitHub

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Desktop Shell** | Electron 33+ | Cross-platform desktop runtime |
| **UI Framework** | Angular 19 | Component-based UI with signals |
| **State Management** | Angular Signals / RxJS | Reactive state for real-time updates |
| **IPC** | Electron IPC | Main ↔ Renderer communication |
| **Automation** | Playwright (existing) | Browser automation |
| **Validation** | Zod (existing) | Schema validation |
| **Build/Package** | electron-builder | Create installers for all platforms |
| **Auto-Update** | electron-updater | GitHub Releases integration |

---

## Project Structure

```
data-broker-optouts/
├── src/                          # Existing CLI code (shared)
│   ├── adapters/
│   ├── config/
│   ├── factories/
│   ├── services/
│   ├── utils/
│   └── types.ts
│
├── desktop/                      # NEW: Electron + Angular app
│   ├── main/                     # Electron main process
│   │   ├── main.ts               # Entry point
│   │   ├── preload.ts            # Preload script (secure IPC bridge)
│   │   ├── ipc/                   # IPC handlers
│   │   │   ├── run.ipc.ts        # Opt-out execution handlers
│   │   │   ├── config.ipc.ts     # Profile/manifest handlers
│   │   │   ├── manifest.ipc.ts   # Manifest update handlers
│   │   │   └── index.ts
│   │   └── services/             # Main process services
│   │       ├── ManifestUpdater.ts
│   │       └── AppUpdater.ts
│   │
│   ├── renderer/                 # Angular app (renderer process)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/         # Core services, guards, interceptors
│   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── electron.service.ts    # IPC wrapper
│   │   │   │   │   │   ├── run.service.ts         # Execution state
│   │   │   │   │   │   └── config.service.ts      # Config management
│   │   │   │   │   └── core.module.ts
│   │   │   │   │
│   │   │   │   ├── features/     # Feature modules
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   │   ├── dashboard.component.ts
│   │   │   │   │   │   ├── progress-card/
│   │   │   │   │   │   └── stats-card/
│   │   │   │   │   │
│   │   │   │   │   ├── profile/
│   │   │   │   │   │   ├── profile-editor.component.ts
│   │   │   │   │   │   └── profile.service.ts
│   │   │   │   │   │
│   │   │   │   │   ├── brokers/
│   │   │   │   │   │   ├── broker-list.component.ts
│   │   │   │   │   │   ├── broker-card.component.ts
│   │   │   │   │   │   └── broker-filter.pipe.ts
│   │   │   │   │   │
│   │   │   │   │   ├── logs/
│   │   │   │   │   │   ├── log-viewer.component.ts
│   │   │   │   │   │   └── log-entry.component.ts
│   │   │   │   │   │
│   │   │   │   │   └── settings/
│   │   │   │   │       ├── settings.component.ts
│   │   │   │   │       └── settings.service.ts
│   │   │   │   │
│   │   │   │   ├── shared/       # Shared components, pipes, directives
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── status-badge/
│   │   │   │   │   │   └── progress-bar/
│   │   │   │   │   └── shared.module.ts
│   │   │   │   │
│   │   │   │   ├── app.component.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   └── app.config.ts
│   │   │   │
│   │   │   ├── assets/
│   │   │   ├── styles/
│   │   │   ├── index.html
│   │   │   └── main.ts
│   │   │
│   │   ├── angular.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── electron-builder.yml      # Build configuration
│   ├── package.json              # Electron app package
│   └── tsconfig.json
│
├── data/
│   ├── manifest.json
│   └── profile.json
│
├── docs/
│   └── NATIVE-UI-PLAN.md
│
└── package.json                  # Root package (workspaces)
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron App                               │
├─────────────────────────────┬────────────────────────────────────┤
│      Main Process           │         Renderer Process            │
│      (Node.js)              │         (Angular 19)                │
├─────────────────────────────┼────────────────────────────────────┤
│                             │                                     │
│  ┌───────────────────────┐  │  ┌─────────────────────────────┐   │
│  │  Existing Services    │  │  │       Angular App           │   │
│  │  ─────────────────    │  │  │  ┌─────────────────────┐    │   │
│  │  • ExecutionOrch.     │  │  │  │    Dashboard        │    │   │
│  │  • AdapterFactory     │  │  │  │  • Progress         │    │   │
│  │  • BrowserFactory     │  │  │  │  • Stats            │    │   │
│  │  • ConfigLoader       │  │  │  │  • Controls         │    │   │
│  │  • StatisticsTracker  │  │  │  └─────────────────────┘    │   │
│  │  • ResumeService      │  │  │  ┌─────────────────────┐    │   │
│  └───────────────────────┘  │  │  │    Profile Editor   │    │   │
│             │               │  │  └─────────────────────┘    │   │
│             ▼               │  │  ┌─────────────────────┐    │   │
│  ┌───────────────────────┐  │  │  │    Broker List      │    │   │
│  │    IPC Handlers       │  │  │  └─────────────────────┘    │   │
│  │  ─────────────────    │  │  │  ┌─────────────────────┐    │   │
│  │  • run:start          │◄─┼──┤  │    Log Viewer       │    │   │
│  │  • run:stop           │  │  │  └─────────────────────┘    │   │
│  │  • run:progress       │──┼─►│  ┌─────────────────────┐    │   │
│  │  • config:load        │  │  │  │    Settings         │    │   │
│  │  • config:save        │  │  │  └─────────────────────┘    │   │
│  │  • manifest:update    │  │  └─────────────────────────────┘   │
│  │  • manifest:check     │  │              │                     │
│  └───────────────────────┘  │              │                     │
│             │               │              ▼                     │
│             ▼               │  ┌─────────────────────────────┐   │
│  ┌───────────────────────┐  │  │    ElectronService          │   │
│  │   ManifestUpdater     │  │  │  (contextBridge API)        │   │
│  │  • Fetch from GitHub  │  │  └─────────────────────────────┘   │
│  │  • Compare versions   │  │                                     │
│  │  • Apply updates      │  │                                     │
│  └───────────────────────┘  │                                     │
│             │               │                                     │
│             ▼               │                                     │
│  ┌───────────────────────┐  │                                     │
│  │     Playwright        │  │                                     │
│  │   (External Browser)  │  │                                     │
│  └───────────────────────┘  │                                     │
│                             │                                     │
└─────────────────────────────┴────────────────────────────────────┘
```

---

## IPC API Design

### Preload Script (Secure Bridge)

```typescript
// desktop/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Run controls
  run: {
    start: (options: RunOptions) => ipcRenderer.invoke('run:start', options),
    stop: () => ipcRenderer.invoke('run:stop'),
    pause: () => ipcRenderer.invoke('run:pause'),
    resume: () => ipcRenderer.invoke('run:resume'),
    onProgress: (callback: (data: ProgressData) => void) => {
      ipcRenderer.on('run:progress', (_, data) => callback(data));
    },
    onComplete: (callback: (data: CompleteData) => void) => {
      ipcRenderer.on('run:complete', (_, data) => callback(data));
    },
  },

  // Configuration
  config: {
    loadProfile: () => ipcRenderer.invoke('config:load-profile'),
    saveProfile: (profile: Profile) => ipcRenderer.invoke('config:save-profile', profile),
    loadManifest: () => ipcRenderer.invoke('config:load-manifest'),
    getSettings: () => ipcRenderer.invoke('config:get-settings'),
    saveSettings: (settings: Settings) => ipcRenderer.invoke('config:save-settings', settings),
  },

  // Manifest updates
  manifest: {
    checkForUpdates: () => ipcRenderer.invoke('manifest:check-updates'),
    applyUpdate: () => ipcRenderer.invoke('manifest:apply-update'),
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      ipcRenderer.on('manifest:update-available', (_, info) => callback(info));
    },
  },

  // App updates (optional)
  app: {
    checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
    downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
    installUpdate: () => ipcRenderer.invoke('app:install-update'),
  },

  // Utilities
  utils: {
    openExternal: (url: string) => ipcRenderer.invoke('utils:open-external', url),
    showItemInFolder: (path: string) => ipcRenderer.invoke('utils:show-in-folder', path),
  },
});
```

### Angular Electron Service

```typescript
// desktop/renderer/src/app/core/services/electron.service.ts
import { Injectable, NgZone, signal } from '@angular/core';

interface ElectronAPI {
  run: { ... };
  config: { ... };
  manifest: { ... };
  app: { ... };
  utils: { ... };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

@Injectable({ providedIn: 'root' })
export class ElectronService {
  private api = window.electronAPI;

  // Signals for reactive state
  readonly isRunning = signal(false);
  readonly progress = signal<ProgressData | null>(null);
  readonly manifestUpdateAvailable = signal<UpdateInfo | null>(null);

  constructor(private ngZone: NgZone) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.api.run.onProgress((data) => {
      this.ngZone.run(() => this.progress.set(data));
    });

    this.api.run.onComplete((data) => {
      this.ngZone.run(() => {
        this.isRunning.set(false);
        this.progress.set(null);
      });
    });

    this.api.manifest.onUpdateAvailable((info) => {
      this.ngZone.run(() => this.manifestUpdateAvailable.set(info));
    });
  }

  // ... method wrappers for IPC calls
}
```

---

## Manifest Auto-Update System

### Update Flow

```
App Launch
    │
    ▼
┌─────────────────────────────────┐
│  Check GitHub for latest        │
│  manifest.json                  │
│  (raw.githubusercontent.com)    │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Compare version/hash with      │
│  local manifest                 │
└─────────────────────────────────┘
    │
    ├─── No changes ───► Continue with local
    │
    ▼
┌─────────────────────────────────┐
│  Show notification:             │
│  "New broker list available"    │
│  [Update Now] [Later]           │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Download & validate new        │
│  manifest with Zod schema       │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Backup old manifest            │
│  Replace with new               │
└─────────────────────────────────┘
```

### ManifestUpdater Service

```typescript
// desktop/main/services/ManifestUpdater.ts
import { app } from 'electron';
import { createHash } from 'crypto';
import { manifestSchema } from '../../src/config/schemas';

export class ManifestUpdater {
  private readonly GITHUB_RAW_URL =
    'https://raw.githubusercontent.com/YOUR_USERNAME/data-broker-optouts/main/data/manifest.json';

  async checkForUpdates(): Promise<UpdateInfo | null> {
    const remote = await this.fetchRemoteManifest();
    const local = await this.loadLocalManifest();

    const remoteHash = this.computeHash(remote);
    const localHash = this.computeHash(local);

    if (remoteHash !== localHash) {
      return {
        available: true,
        currentBrokerCount: local.length,
        newBrokerCount: remote.length,
        added: this.findAdded(local, remote),
        removed: this.findRemoved(local, remote),
      };
    }

    return null;
  }

  async applyUpdate(): Promise<void> {
    const remote = await this.fetchRemoteManifest();

    // Validate with Zod
    const validated = manifestSchema.parse(remote);

    // Backup current
    await this.backupCurrentManifest();

    // Write new
    await this.writeManifest(validated);
  }

  private async fetchRemoteManifest(): Promise<Broker[]> {
    const response = await fetch(this.GITHUB_RAW_URL);
    return response.json();
  }

  private computeHash(data: unknown): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
}
```

---

## UI Components

### Dashboard Component

```typescript
// desktop/renderer/src/app/features/dashboard/dashboard.component.ts
import { Component, computed, inject } from '@angular/core';
import { RunService } from '../../core/services/run.service';
import { ProgressCardComponent } from './progress-card/progress-card.component';
import { StatsCardComponent } from './stats-card/stats-card.component';
import { RunControlsComponent } from './run-controls/run-controls.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ProgressCardComponent, StatsCardComponent, RunControlsComponent],
  template: `
    <div class="dashboard">
      <app-progress-card
        [current]="progress()?.current ?? 0"
        [total]="progress()?.total ?? 0"
        [currentBroker]="progress()?.broker"
      />

      <app-stats-card [stats]="stats()" />

      <app-run-controls
        [isRunning]="isRunning()"
        [isPaused]="isPaused()"
        (start)="onStart()"
        (stop)="onStop()"
        (pause)="onPause()"
        (resume)="onResume()"
      />

      @if (currentLog()) {
        <div class="current-status">
          <span class="status-icon">{{ statusIcon() }}</span>
          <span>{{ currentLog() }}</span>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  private runService = inject(RunService);

  readonly isRunning = this.runService.isRunning;
  readonly isPaused = this.runService.isPaused;
  readonly progress = this.runService.progress;
  readonly stats = this.runService.stats;
  readonly currentLog = this.runService.currentLog;

  readonly statusIcon = computed(() => {
    const status = this.progress()?.status;
    switch (status) {
      case 'captcha': return '🔐';
      case 'processing': return '⏳';
      case 'success': return '✓';
      case 'failed': return '✗';
      default: return '○';
    }
  });

  onStart(): void { this.runService.start(); }
  onStop(): void { this.runService.stop(); }
  onPause(): void { this.runService.pause(); }
  onResume(): void { this.runService.resume(); }
}
```

### Broker List Component

```typescript
// desktop/renderer/src/app/features/brokers/broker-list.component.ts
import { Component, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { BrokerCardComponent } from './broker-card/broker-card.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-broker-list',
  standalone: true,
  imports: [BrokerCardComponent, FormsModule],
  template: `
    <div class="broker-list">
      <div class="toolbar">
        <input
          type="text"
          placeholder="Filter brokers..."
          [(ngModel)]="filterText"
        />
        <select [(ngModel)]="statusFilter">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div class="list">
        @for (broker of filteredBrokers(); track broker.name) {
          <app-broker-card
            [broker]="broker"
            [status]="getStatus(broker.name)"
            (toggle)="onToggle(broker.name)"
          />
        }
      </div>

      <div class="summary">
        {{ filteredBrokers().length }} of {{ brokers().length }} brokers
      </div>
    </div>
  `,
})
export class BrokerListComponent {
  private configService = inject(ConfigService);

  readonly brokers = this.configService.brokers;
  readonly filterText = signal('');
  readonly statusFilter = signal('all');

  readonly filteredBrokers = computed(() => {
    let result = this.brokers();

    if (this.filterText()) {
      const filter = this.filterText().toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(filter)
      );
    }

    // Apply status filter...
    return result;
  });
}
```

---

## Implementation Phases

### Phase 1: Project Scaffolding
- [ ] Create `desktop/` directory structure
- [ ] Initialize Electron project with TypeScript
- [ ] Set up Angular 19 project in `desktop/renderer/`
- [ ] Configure electron-builder for packaging
- [ ] Set up npm workspaces for monorepo
- [ ] Create basic Electron main process with window
- [ ] Implement preload script with contextBridge
- [ ] Verify Angular app loads in Electron window

**Complexity:** LOW

### Phase 2: IPC Infrastructure
- [ ] Create IPC handler structure in main process
- [ ] Implement `config:load-profile` and `config:save-profile`
- [ ] Implement `config:load-manifest`
- [ ] Create Angular `ElectronService` with typed IPC calls
- [ ] Add NgZone integration for change detection
- [ ] Test bidirectional communication

**Complexity:** MEDIUM

### Phase 3: Core Integration
- [ ] Import existing services into main process
- [ ] Adapt `ExecutionOrchestrator` to emit progress events
- [ ] Implement `run:start` with options (headful, stealth, filter, etc.)
- [ ] Implement `run:stop` and `run:pause`
- [ ] Create progress event stream (main → renderer)
- [ ] Handle human-in-the-loop prompts via IPC

**Complexity:** MEDIUM-HIGH

### Phase 4: Angular UI - Core Views
- [ ] Create app shell with navigation
- [ ] Implement Dashboard component with progress/stats
- [ ] Implement Profile Editor with form validation
- [ ] Implement Broker List with filtering
- [ ] Implement Settings panel
- [ ] Add responsive layout and theming

**Complexity:** MEDIUM

### Phase 5: Angular UI - Advanced Features
- [ ] Real-time Log Viewer component
- [ ] Broker detail view with requirements info
- [ ] Run history / session management
- [ ] Export logs functionality
- [ ] Keyboard shortcuts

**Complexity:** MEDIUM

### Phase 6: Manifest Auto-Update
- [ ] Implement `ManifestUpdater` service
- [ ] Add GitHub raw file fetching
- [ ] Implement hash comparison for change detection
- [ ] Create update notification UI
- [ ] Add backup/restore mechanism
- [ ] Test update flow end-to-end

**Complexity:** LOW-MEDIUM

### Phase 7: Packaging & Distribution
- [ ] Configure electron-builder for Windows (.exe, portable)
- [ ] Configure for macOS (.dmg, .app)
- [ ] Configure for Linux (.AppImage, .deb)
- [ ] Set up GitHub Actions for automated builds
- [ ] Create GitHub Release workflow
- [ ] Add app icons and branding
- [ ] Write installation documentation

**Complexity:** MEDIUM

### Phase 8: App Auto-Update (Optional)
- [ ] Integrate electron-updater
- [ ] Configure update server (GitHub Releases)
- [ ] Implement update check on startup
- [ ] Add update notification and install UI
- [ ] Test auto-update flow

**Complexity:** MEDIUM

---

## GitHub Actions Workflow

```yaml
# .github/workflows/build-desktop.yml
name: Build Desktop App

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build Angular app
        run: npm run build:renderer
        working-directory: desktop

      - name: Build Electron app
        run: npm run build:electron
        working-directory: desktop

      - name: Package app
        run: npm run package
        working-directory: desktop

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: app-${{ matrix.os }}
          path: desktop/dist/*

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            app-windows-latest/*
            app-macos-latest/*
            app-ubuntu-latest/*
```

---

## Development Workflow

```bash
# Install all dependencies
npm install

# Development mode (hot reload)
npm run dev:desktop

# Build for production
npm run build:desktop

# Package for current platform
npm run package:desktop

# Package for all platforms
npm run package:desktop:all
```

---

## Key Technical Decisions

### 1. Separate Playwright Browser
Playwright will launch an **external browser** (not inside Electron). This is intentional because:
- Avoids conflicts with Electron's Chromium
- Allows headful mode where user sees the actual browser
- Matches current CLI behavior
- Better for CAPTCHA solving (user interacts with real browser)

### 2. Angular Signals for State
Using Angular 19 signals instead of traditional RxJS for component state because:
- Simpler mental model
- Better performance (fine-grained reactivity)
- Native change detection integration
- RxJS still used for streams (IPC events)

### 3. Standalone Components
All Angular components will be standalone (no NgModules) per Angular 19 best practices:
- Simpler imports
- Better tree-shaking
- Easier to understand dependencies

### 4. Monorepo with Workspaces
Using npm workspaces to share code between CLI and desktop:
- `src/` - Shared services, adapters, types
- `desktop/` - Electron + Angular specific code
- Single `node_modules` at root

---

## Security Considerations

1. **Context Isolation**: Enabled by default, renderer cannot access Node.js
2. **Preload Script**: Only expose specific, validated IPC methods
3. **No Remote Module**: Disabled, all IPC is explicit
4. **CSP Headers**: Strict Content Security Policy in renderer
5. **Input Validation**: All IPC inputs validated with Zod
6. **No Arbitrary Code**: Never execute user-provided code

---

## Future: Mobile Support

If mobile is needed later, consider:

1. **Capacitor** - Wrap Angular app for iOS/Android
   - Pros: Reuse entire Angular UI
   - Cons: No Playwright on mobile (would need server component)

2. **Separate Mobile App** - React Native or Flutter
   - Pros: True native experience
   - Cons: Separate codebase

3. **PWA** - Progressive Web App
   - Pros: Works everywhere, same codebase
   - Cons: Limited native capabilities, still needs server for Playwright

**Recommendation**: If mobile needed, use Capacitor with a cloud service that runs Playwright. Desktop app remains self-contained.

---

## Next Steps

1. ✅ Plan approved
2. [ ] Create `desktop/` directory structure
3. [ ] Initialize Electron + Angular projects
4. [ ] Begin Phase 1 implementation
