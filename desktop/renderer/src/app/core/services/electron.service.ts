import { Injectable, NgZone, signal, computed, OnDestroy } from '@angular/core';

// Type definitions matching preload.ts
export interface RunOptions {
  headful?: boolean;
  stealth?: boolean;
  dryRun?: boolean;
  filter?: string[];
  exclude?: string[];
  limit?: number;
}

export interface ProgressData {
  current: number;
  total: number;
  broker: string;
  status: 'pending' | 'processing' | 'captcha' | 'manual' | 'success' | 'failed' | 'skipped';
  message?: string;
}

export interface CompleteData {
  success: number;
  failed: number;
  skipped: number;
  manual: number;
  total: number;
  logFile: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string;
  state?: string;
  zip?: string;
}

export interface Broker {
  name: string;
  removalUrl: string;
  requirements: string[];
  adapter: string;
  config?: Record<string, unknown>;
  notes?: string;
}

export interface Settings {
  headful: boolean;
  stealth: boolean;
  autoCheckManifestUpdates: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface ManifestUpdateInfo {
  available: boolean;
  currentBrokerCount: number;
  newBrokerCount: number;
  added: string[];
  removed: string[];
  modified: string[];
}

export interface AppUpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

// Check if running in Electron
function isElectron(): boolean {
  return !!(window as { electronAPI?: unknown }).electronAPI;
}

@Injectable({
  providedIn: 'root'
})
export class ElectronService implements OnDestroy {
  private readonly cleanupFns: (() => void)[] = [];

  // Signals for reactive state
  readonly isElectron = signal(isElectron());
  readonly isRunning = signal(false);
  readonly isPaused = signal(false);
  readonly progress = signal<ProgressData | null>(null);
  readonly logs = signal<string[]>([]);
  readonly manifestUpdateAvailable = signal<ManifestUpdateInfo | null>(null);
  readonly humanInputPrompt = signal<string | null>(null);

  // Computed values
  readonly progressPercent = computed(() => {
    const p = this.progress();
    if (!p || p.total === 0) return 0;
    return Math.round((p.current / p.total) * 100);
  });

  constructor(private ngZone: NgZone) {
    if (this.isElectron()) {
      this.setupListeners();
    }
  }

  ngOnDestroy(): void {
    // Cleanup all listeners
    this.cleanupFns.forEach(fn => fn());
  }

  private get api() {
    return (window as { electronAPI: Window['electronAPI'] }).electronAPI;
  }

  private setupListeners(): void {
    // Progress updates
    const cleanupProgress = this.api.run.onProgress((data) => {
      this.ngZone.run(() => this.progress.set(data));
    });
    this.cleanupFns.push(cleanupProgress);

    // Completion
    const cleanupComplete = this.api.run.onComplete((data) => {
      this.ngZone.run(() => {
        this.isRunning.set(false);
        this.isPaused.set(false);
        this.progress.set(null);
        this.addLog(`Completed: ${data.success} success, ${data.failed} failed, ${data.skipped} skipped, ${data.manual} manual`);
      });
    });
    this.cleanupFns.push(cleanupComplete);

    // Log messages
    const cleanupLog = this.api.run.onLog((message) => {
      this.ngZone.run(() => this.addLog(message));
    });
    this.cleanupFns.push(cleanupLog);

    // Human input prompts
    const cleanupHuman = this.api.run.onHumanInput((prompt) => {
      this.ngZone.run(() => this.humanInputPrompt.set(prompt));
    });
    this.cleanupFns.push(cleanupHuman);

    // Manifest updates
    const cleanupManifest = this.api.manifest.onUpdateAvailable((info) => {
      this.ngZone.run(() => this.manifestUpdateAvailable.set(info));
    });
    this.cleanupFns.push(cleanupManifest);
  }

  private addLog(message: string): void {
    this.logs.update(logs => [...logs, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }

  clearLogs(): void {
    this.logs.set([]);
  }

  // Run controls
  async startRun(options: RunOptions): Promise<void> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }

    this.isRunning.set(true);
    this.isPaused.set(false);
    this.logs.set([]);

    try {
      await this.api.run.start(options);
    } catch (error) {
      this.isRunning.set(false);
      throw error;
    }
  }

  async stopRun(): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.run.stop();
    this.isRunning.set(false);
    this.isPaused.set(false);
  }

  async pauseRun(): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.run.pause();
    this.isPaused.set(true);
  }

  async resumeRun(): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.run.resume();
    this.isPaused.set(false);
  }

  async submitHumanInput(response: string): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.run.submitHumanInput(response);
    this.humanInputPrompt.set(null);
  }

  // Configuration
  async loadProfile(): Promise<Profile> {
    if (!this.isElectron()) {
      return { fullName: '', email: '' };
    }
    return this.api.config.loadProfile();
  }

  async saveProfile(profile: Profile): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.config.saveProfile(profile);
  }

  async loadManifest(): Promise<Broker[]> {
    if (!this.isElectron()) return [];
    return this.api.config.loadManifest();
  }

  async getSettings(): Promise<Settings> {
    if (!this.isElectron()) {
      return {
        headful: true,
        stealth: true,
        autoCheckManifestUpdates: true,
        theme: 'system'
      };
    }
    return this.api.config.getSettings();
  }

  async saveSettings(settings: Settings): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.config.saveSettings(settings);
  }

  async getDataPath(): Promise<string> {
    if (!this.isElectron()) return '';
    return this.api.config.getDataPath();
  }

  // Manifest updates
  async checkManifestUpdates(): Promise<ManifestUpdateInfo | null> {
    if (!this.isElectron()) return null;
    const info = await this.api.manifest.checkForUpdates();
    this.manifestUpdateAvailable.set(info);
    return info;
  }

  async applyManifestUpdate(): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.manifest.applyUpdate();
    this.manifestUpdateAvailable.set(null);
  }

  // App updates
  async getAppVersion(): Promise<string> {
    if (!this.isElectron()) return '0.0.0';
    return this.api.app.getVersion();
  }

  async checkAppUpdates(): Promise<AppUpdateInfo | null> {
    if (!this.isElectron()) return null;
    return this.api.app.checkForUpdates();
  }

  // Utilities
  async openExternal(url: string): Promise<void> {
    if (!this.isElectron()) {
      window.open(url, '_blank');
      return;
    }
    await this.api.utils.openExternal(url);
  }

  async showInFolder(path: string): Promise<void> {
    if (!this.isElectron()) return;
    await this.api.utils.showItemInFolder(path);
  }

  async selectFile(options?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null> {
    if (!this.isElectron()) return null;
    return this.api.utils.selectFile(options);
  }
}
