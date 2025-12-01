import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { registerConfigHandlers } from './ipc/config.ipc';
import { registerRunHandlers } from './ipc/run.ipc';
import { registerManifestHandlers } from './ipc/manifest.ipc';
import { registerUtilsHandlers } from './ipc/utils.ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

// Determine if we're in development mode
const isDev = !app.isPackaged;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script to work properly
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    show: false, // Don't show until ready
    titleBarStyle: 'default',
    backgroundColor: '#1a1a2e',
  });

  // Show window when ready to avoid visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the Angular app
  if (isDev) {
    // Development: load from Angular dev server
    mainWindow.loadURL('http://localhost:4200');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/browser/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register all IPC handlers
function registerIpcHandlers(): void {
  registerConfigHandlers(ipcMain);
  registerRunHandlers(ipcMain, () => mainWindow);
  registerManifestHandlers(ipcMain);
  registerUtilsHandlers(ipcMain);
}

// App lifecycle events
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    // Allow navigation only to our app URLs
    const appUrl = isDev ? 'http://localhost:4200' : 'file://';
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

// Export for IPC handlers to send events to renderer
export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}
