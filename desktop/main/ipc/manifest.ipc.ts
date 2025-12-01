import { IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDataPath } from './config.ipc';

interface Broker {
  name: string;
  removalUrl: string;
  requirements: string[];
  adapter: string;
  config?: Record<string, unknown>;
  notes?: string;
}

interface ManifestUpdateInfo {
  available: boolean;
  currentBrokerCount: number;
  newBrokerCount: number;
  added: string[];
  removed: string[];
  modified: string[];
}

// GitHub raw URL for manifest - update with actual repo
const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/data-broker-optouts/main/data/manifest.json';

let lastChecked: string | null = null;
let cachedRemoteManifest: Broker[] | null = null;

function computeHash(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function getBrokerSignature(broker: Broker): string {
  // Create a signature for comparison that includes key fields
  return JSON.stringify({
    name: broker.name,
    removalUrl: broker.removalUrl,
    requirements: broker.requirements,
    adapter: broker.adapter,
  });
}

async function fetchRemoteManifest(): Promise<Broker[]> {
  const response = await fetch(GITHUB_RAW_URL, {
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as Broker[];
}

function loadLocalManifest(): Broker[] {
  const manifestPath = path.join(getDataPath(), 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const content = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(content) as Broker[];
}

function compareManifests(local: Broker[], remote: Broker[]): ManifestUpdateInfo {
  const localNames = new Set(local.map((b) => b.name));
  const remoteNames = new Set(remote.map((b) => b.name));

  const localSignatures = new Map(local.map((b) => [b.name, getBrokerSignature(b)]));
  const remoteSignatures = new Map(remote.map((b) => [b.name, getBrokerSignature(b)]));

  // Find added brokers
  const added = [...remoteNames].filter((name) => !localNames.has(name));

  // Find removed brokers
  const removed = [...localNames].filter((name) => !remoteNames.has(name));

  // Find modified brokers
  const modified: string[] = [];
  for (const name of localNames) {
    if (remoteNames.has(name)) {
      const localSig = localSignatures.get(name);
      const remoteSig = remoteSignatures.get(name);
      if (localSig !== remoteSig) {
        modified.push(name);
      }
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

  return {
    available: hasChanges,
    currentBrokerCount: local.length,
    newBrokerCount: remote.length,
    added,
    removed,
    modified,
  };
}

export function registerManifestHandlers(ipcMain: IpcMain): void {
  // Check for manifest updates
  ipcMain.handle('manifest:check-updates', async (): Promise<ManifestUpdateInfo | null> => {
    try {
      const local = loadLocalManifest();
      const remote = await fetchRemoteManifest();

      // Cache the remote manifest for apply
      cachedRemoteManifest = remote;
      lastChecked = new Date().toISOString();

      const comparison = compareManifests(local, remote);

      if (!comparison.available) {
        return null;
      }

      return comparison;
    } catch (error) {
      console.error('Failed to check for manifest updates:', error);
      throw error;
    }
  });

  // Apply manifest update
  ipcMain.handle('manifest:apply-update', async (): Promise<void> => {
    if (!cachedRemoteManifest) {
      // Fetch fresh if not cached
      cachedRemoteManifest = await fetchRemoteManifest();
    }

    const dataPath = getDataPath();
    const manifestPath = path.join(dataPath, 'manifest.json');

    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    // Backup current manifest
    if (fs.existsSync(manifestPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(dataPath, `manifest.backup.${timestamp}.json`);
      fs.copyFileSync(manifestPath, backupPath);

      // Keep only last 5 backups
      const files = fs.readdirSync(dataPath);
      const backups = files
        .filter((f) => f.startsWith('manifest.backup.') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const backup of backups.slice(5)) {
        fs.unlinkSync(path.join(dataPath, backup));
      }
    }

    // Write new manifest
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(cachedRemoteManifest, null, 2),
      'utf-8'
    );

    // Clear cache
    cachedRemoteManifest = null;
  });

  // Get last checked timestamp
  ipcMain.handle('manifest:last-checked', async (): Promise<string | null> => {
    return lastChecked;
  });
}

// Export for use by app startup
export { fetchRemoteManifest, loadLocalManifest, compareManifests };
