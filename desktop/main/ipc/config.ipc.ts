import { IpcMain, app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface Profile {
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string;
  state?: string;
  zip?: string;
}

interface Broker {
  name: string;
  removalUrl: string;
  requirements: string[];
  adapter: string;
  config?: Record<string, unknown>;
  notes?: string;
}

interface Settings {
  headful: boolean;
  stealth: boolean;
  autoCheckManifestUpdates: boolean;
  theme: 'light' | 'dark' | 'system';
}

const DEFAULT_SETTINGS: Settings = {
  headful: true,
  stealth: true,
  autoCheckManifestUpdates: true,
  theme: 'system',
};

function getDataPath(): string {
  // In development, use project data folder
  // In production, use app resources or user data
  if (!app.isPackaged) {
    return path.join(__dirname, '../../..', 'data');
  }
  // Check if data exists in resources (bundled with app)
  const resourcePath = path.join(process.resourcesPath, 'data');
  if (fs.existsSync(resourcePath)) {
    return resourcePath;
  }
  // Fall back to user data directory
  return path.join(app.getPath('userData'), 'data');
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function registerConfigHandlers(ipcMain: IpcMain): void {
  // Load profile
  ipcMain.handle('config:load-profile', async (): Promise<Profile> => {
    const profilePath = path.join(getDataPath(), 'profile.json');

    if (!fs.existsSync(profilePath)) {
      // Return empty profile if doesn't exist
      return {
        fullName: '',
        email: '',
        phone: null,
        address: null,
        city: '',
        state: '',
        zip: '',
      };
    }

    const content = fs.readFileSync(profilePath, 'utf-8');
    return JSON.parse(content) as Profile;
  });

  // Save profile
  ipcMain.handle('config:save-profile', async (_event, profile: Profile): Promise<void> => {
    const dataPath = getDataPath();

    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    const profilePath = path.join(dataPath, 'profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  });

  // Load manifest
  ipcMain.handle('config:load-manifest', async (): Promise<Broker[]> => {
    const manifestPath = path.join(getDataPath(), 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return [];
    }

    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as Broker[];
  });

  // Get settings
  ipcMain.handle('config:get-settings', async (): Promise<Settings> => {
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return DEFAULT_SETTINGS;
    }

    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const saved = JSON.parse(content) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Save settings
  ipcMain.handle('config:save-settings', async (_event, settings: Settings): Promise<void> => {
    const settingsPath = getSettingsPath();
    const userDataPath = app.getPath('userData');

    // Ensure user data directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  });

  // Get data path (for display in UI)
  ipcMain.handle('config:get-data-path', async (): Promise<string> => {
    return getDataPath();
  });
}

// Export for use by other modules
export { getDataPath };
