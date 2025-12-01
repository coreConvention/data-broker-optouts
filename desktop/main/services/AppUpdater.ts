import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, app } from 'electron';

// Type for update status callback
type UpdateStatusCallback = (status: string, info?: UpdateInfo) => void;

export class AppUpdater {
  private mainWindow: BrowserWindow | null = null;
  private statusCallback: UpdateStatusCallback | null = null;

  constructor() {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event listeners
    this.setupEventListeners();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setStatusCallback(callback: UpdateStatusCallback): void {
    this.statusCallback = callback;
  }

  private setupEventListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus('checking');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.sendStatus('available', info);
      this.sendToRenderer('app:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.sendStatus('not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendStatus(`downloading: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.sendStatus('downloaded', info);
      this.sendToRenderer('app:update-downloaded', {
        version: info.version,
      });
    });

    autoUpdater.on('error', (error) => {
      this.sendStatus(`error: ${error.message}`);
      console.error('Auto-update error:', error);
    });
  }

  private sendStatus(status: string, info?: UpdateInfo): void {
    if (this.statusCallback) {
      this.statusCallback(status, info);
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo ?? null;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return null;
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      throw error;
    }
  }

  installUpdate(): void {
    // This will quit the app and install the update
    autoUpdater.quitAndInstall(false, true);
  }

  getVersion(): string {
    return app.getVersion();
  }
}

// Singleton instance
let appUpdaterInstance: AppUpdater | null = null;

export function getAppUpdater(): AppUpdater {
  if (!appUpdaterInstance) {
    appUpdaterInstance = new AppUpdater();
  }
  return appUpdaterInstance;
}
