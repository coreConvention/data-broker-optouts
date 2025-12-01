import { IpcMain, shell, dialog, app } from 'electron';
import { getAppUpdater } from '../services/AppUpdater';

export function registerUtilsHandlers(ipcMain: IpcMain): void {
  const appUpdater = getAppUpdater();

  // Open URL in default browser
  ipcMain.handle('utils:open-external', async (_event, url: string): Promise<void> => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid URL protocol');
      }
      await shell.openExternal(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  });

  // Show file in system file manager
  ipcMain.handle('utils:show-in-folder', async (_event, filePath: string): Promise<void> => {
    shell.showItemInFolder(filePath);
  });

  // Open file selection dialog
  ipcMain.handle(
    'utils:select-file',
    async (
      _event,
      options?: { filters?: { name: string; extensions: string[] }[] }
    ): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0] ?? null;
    }
  );

  // Open directory selection dialog
  ipcMain.handle('utils:select-directory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  // Get app version
  ipcMain.handle('app:get-version', async (): Promise<string> => {
    return app.getVersion();
  });

  // App update handlers
  ipcMain.handle('app:check-updates', async () => {
    try {
      const info = await appUpdater.checkForUpdates();
      if (info) {
        return {
          version: info.version,
          releaseNotes: info.releaseNotes,
          releaseDate: info.releaseDate,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return null;
    }
  });

  ipcMain.handle('app:download-update', async (): Promise<void> => {
    await appUpdater.downloadUpdate();
  });

  ipcMain.handle('app:install-update', async (): Promise<void> => {
    appUpdater.installUpdate();
  });
}
