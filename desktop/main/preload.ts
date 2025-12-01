import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for the exposed API
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

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Run controls
  run: {
    start: (options: RunOptions): Promise<void> =>
      ipcRenderer.invoke('run:start', options),
    stop: (): Promise<void> =>
      ipcRenderer.invoke('run:stop'),
    pause: (): Promise<void> =>
      ipcRenderer.invoke('run:pause'),
    resume: (): Promise<void> =>
      ipcRenderer.invoke('run:resume'),
    getStatus: (): Promise<{ isRunning: boolean; isPaused: boolean }> =>
      ipcRenderer.invoke('run:status'),
    onProgress: (callback: (data: ProgressData) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: ProgressData) => callback(data);
      ipcRenderer.on('run:progress', listener);
      return () => ipcRenderer.removeListener('run:progress', listener);
    },
    onComplete: (callback: (data: CompleteData) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: CompleteData) => callback(data);
      ipcRenderer.on('run:complete', listener);
      return () => ipcRenderer.removeListener('run:complete', listener);
    },
    onLog: (callback: (message: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('run:log', listener);
      return () => ipcRenderer.removeListener('run:log', listener);
    },
    onHumanInput: (callback: (prompt: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, prompt: string) => callback(prompt);
      ipcRenderer.on('run:human-input', listener);
      return () => ipcRenderer.removeListener('run:human-input', listener);
    },
    submitHumanInput: (response: string): Promise<void> =>
      ipcRenderer.invoke('run:human-input-response', response),
  },

  // Configuration
  config: {
    loadProfile: (): Promise<Profile> =>
      ipcRenderer.invoke('config:load-profile'),
    saveProfile: (profile: Profile): Promise<void> =>
      ipcRenderer.invoke('config:save-profile', profile),
    loadManifest: (): Promise<Broker[]> =>
      ipcRenderer.invoke('config:load-manifest'),
    getSettings: (): Promise<Settings> =>
      ipcRenderer.invoke('config:get-settings'),
    saveSettings: (settings: Settings): Promise<void> =>
      ipcRenderer.invoke('config:save-settings', settings),
    getDataPath: (): Promise<string> =>
      ipcRenderer.invoke('config:get-data-path'),
  },

  // Manifest updates
  manifest: {
    checkForUpdates: (): Promise<ManifestUpdateInfo | null> =>
      ipcRenderer.invoke('manifest:check-updates'),
    applyUpdate: (): Promise<void> =>
      ipcRenderer.invoke('manifest:apply-update'),
    getLastChecked: (): Promise<string | null> =>
      ipcRenderer.invoke('manifest:last-checked'),
    onUpdateAvailable: (callback: (info: ManifestUpdateInfo) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, info: ManifestUpdateInfo) => callback(info);
      ipcRenderer.on('manifest:update-available', listener);
      return () => ipcRenderer.removeListener('manifest:update-available', listener);
    },
  },

  // App updates (optional feature)
  app: {
    checkForUpdates: (): Promise<AppUpdateInfo | null> =>
      ipcRenderer.invoke('app:check-updates'),
    downloadUpdate: (): Promise<void> =>
      ipcRenderer.invoke('app:download-update'),
    installUpdate: (): Promise<void> =>
      ipcRenderer.invoke('app:install-update'),
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('app:get-version'),
    onUpdateAvailable: (callback: (info: AppUpdateInfo) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, info: AppUpdateInfo) => callback(info);
      ipcRenderer.on('app:update-available', listener);
      return () => ipcRenderer.removeListener('app:update-available', listener);
    },
    onUpdateDownloaded: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on('app:update-downloaded', listener);
      return () => ipcRenderer.removeListener('app:update-downloaded', listener);
    },
  },

  // Utilities
  utils: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('utils:open-external', url),
    showItemInFolder: (path: string): Promise<void> =>
      ipcRenderer.invoke('utils:show-in-folder', path),
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null> =>
      ipcRenderer.invoke('utils:select-file', options),
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('utils:select-directory'),
  },
});

// Type declaration for the window object
declare global {
  interface Window {
    electronAPI: {
      run: {
        start: (options: RunOptions) => Promise<void>;
        stop: () => Promise<void>;
        pause: () => Promise<void>;
        resume: () => Promise<void>;
        getStatus: () => Promise<{ isRunning: boolean; isPaused: boolean }>;
        onProgress: (callback: (data: ProgressData) => void) => () => void;
        onComplete: (callback: (data: CompleteData) => void) => () => void;
        onLog: (callback: (message: string) => void) => () => void;
        onHumanInput: (callback: (prompt: string) => void) => () => void;
        submitHumanInput: (response: string) => Promise<void>;
      };
      config: {
        loadProfile: () => Promise<Profile>;
        saveProfile: (profile: Profile) => Promise<void>;
        loadManifest: () => Promise<Broker[]>;
        getSettings: () => Promise<Settings>;
        saveSettings: (settings: Settings) => Promise<void>;
        getDataPath: () => Promise<string>;
      };
      manifest: {
        checkForUpdates: () => Promise<ManifestUpdateInfo | null>;
        applyUpdate: () => Promise<void>;
        getLastChecked: () => Promise<string | null>;
        onUpdateAvailable: (callback: (info: ManifestUpdateInfo) => void) => () => void;
      };
      app: {
        checkForUpdates: () => Promise<AppUpdateInfo | null>;
        downloadUpdate: () => Promise<void>;
        installUpdate: () => Promise<void>;
        getVersion: () => Promise<string>;
        onUpdateAvailable: (callback: (info: AppUpdateInfo) => void) => () => void;
        onUpdateDownloaded: (callback: () => void) => () => void;
      };
      utils: {
        openExternal: (url: string) => Promise<void>;
        showItemInFolder: (path: string) => Promise<void>;
        selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
        selectDirectory: () => Promise<string | null>;
      };
    };
  }
}
