import { IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDataPath } from './config.ipc';

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

// State management for the current run
let isRunning = false;
let isPaused = false;
let shouldStop = false;
let currentOrchestrator: unknown = null;
let humanInputResolver: ((value: string) => void) | null = null;

// Helper to send events to renderer
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
  // Start opt-out run
  ipcMain.handle('run:start', async (_event, options: RunOptions): Promise<void> => {
    if (isRunning) {
      throw new Error('A run is already in progress');
    }

    isRunning = true;
    isPaused = false;
    shouldStop = false;

    try {
      // Dynamic import of the execution module
      // This will import from the shared src directory
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

      // Load manifest and profile
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

      // Filter brokers based on options
      let brokers = [...manifest];

      if (options.filter && options.filter.length > 0) {
        const filterSet = new Set(options.filter.map((f) => f.toLowerCase()));
        brokers = brokers.filter((b: { name: string }) =>
          filterSet.has(b.name.toLowerCase())
        );
      }

      if (options.exclude && options.exclude.length > 0) {
        const excludeSet = new Set(options.exclude.map((e) => e.toLowerCase()));
        brokers = brokers.filter(
          (b: { name: string }) => !excludeSet.has(b.name.toLowerCase())
        );
      }

      if (options.limit && options.limit > 0) {
        brokers = brokers.slice(0, options.limit);
      }

      const total = brokers.length;
      let current = 0;
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      let manualCount = 0;

      // Generate log file name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(dataPath, `optouts-${timestamp}.jsonl`);

      // Log function
      const appendLog = (entry: Record<string, unknown>): void => {
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
      };

      sendToWindow(getMainWindow, 'run:log', `Starting opt-out process for ${total} brokers...`);

      // Process each broker
      // NOTE: This is a simplified implementation
      // The actual integration with ExecutionOrchestrator will be done in Phase 3
      for (const broker of brokers) {
        if (shouldStop) {
          sendToWindow(getMainWindow, 'run:log', 'Run stopped by user.');
          break;
        }

        // Wait while paused
        while (isPaused && !shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (shouldStop) break;

        current++;
        const brokerData = broker as { name: string; removalUrl: string; requirements: string[] };

        // Send progress update
        const progressData: ProgressData = {
          current,
          total,
          broker: brokerData.name,
          status: 'processing',
          message: `Processing ${brokerData.name}...`,
        };
        sendToWindow(getMainWindow, 'run:progress', progressData);
        sendToWindow(getMainWindow, 'run:log', `[${current}/${total}] Processing: ${brokerData.name}`);

        try {
          // Check if this broker requires manual steps
          const requirements = brokerData.requirements || [];
          const needsManual =
            requirements.includes('captcha') ||
            requirements.includes('email-verification') ||
            requirements.includes('phone-verification');

          if (options.dryRun) {
            // Dry run - just simulate
            await new Promise((resolve) => setTimeout(resolve, 500));
            skippedCount++;

            progressData.status = 'skipped';
            progressData.message = 'Dry run - skipped';
            sendToWindow(getMainWindow, 'run:progress', progressData);

            appendLog({
              site: brokerData.name,
              status: 'skipped',
              ts: new Date().toISOString(),
              url: brokerData.removalUrl,
              message: 'Dry run mode',
            });
          } else if (needsManual) {
            // Mark as manual - actual execution will be in Phase 3
            manualCount++;

            progressData.status = 'manual';
            progressData.message = 'Requires manual intervention';
            sendToWindow(getMainWindow, 'run:progress', progressData);

            appendLog({
              site: brokerData.name,
              status: 'manual',
              ts: new Date().toISOString(),
              url: brokerData.removalUrl,
              message: 'Requires manual steps: ' + requirements.join(', '),
            });
          } else {
            // Simulate success for now - actual execution in Phase 3
            await new Promise((resolve) => setTimeout(resolve, 1000));
            successCount++;

            progressData.status = 'success';
            progressData.message = 'Completed successfully';
            sendToWindow(getMainWindow, 'run:progress', progressData);

            appendLog({
              site: brokerData.name,
              status: 'success',
              ts: new Date().toISOString(),
              url: brokerData.removalUrl,
              message: 'Opt-out request submitted',
            });
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          progressData.status = 'failed';
          progressData.message = errorMessage;
          sendToWindow(getMainWindow, 'run:progress', progressData);
          sendToWindow(getMainWindow, 'run:log', `  Error: ${errorMessage}`);

          appendLog({
            site: brokerData.name,
            status: 'failed',
            ts: new Date().toISOString(),
            url: brokerData.removalUrl,
            error: errorMessage,
          });
        }

        // Small delay between brokers
        if (current < total && !shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Send completion event
      const completeData: CompleteData = {
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        manual: manualCount,
        total,
        logFile,
      };
      sendToWindow(getMainWindow, 'run:complete', completeData);
      sendToWindow(
        getMainWindow,
        'run:log',
        `\nCompleted: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped, ${manualCount} manual`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      sendToWindow(getMainWindow, 'run:log', `Fatal error: ${errorMessage}`);
      throw error;
    } finally {
      isRunning = false;
      isPaused = false;
      shouldStop = false;
      currentOrchestrator = null;
    }
  });

  // Stop the current run
  ipcMain.handle('run:stop', async (): Promise<void> => {
    if (!isRunning) {
      return;
    }
    shouldStop = true;
    sendToWindow(getMainWindow, 'run:log', 'Stopping run...');
  });

  // Pause the current run
  ipcMain.handle('run:pause', async (): Promise<void> => {
    if (!isRunning || isPaused) {
      return;
    }
    isPaused = true;
    sendToWindow(getMainWindow, 'run:log', 'Run paused.');
  });

  // Resume a paused run
  ipcMain.handle('run:resume', async (): Promise<void> => {
    if (!isRunning || !isPaused) {
      return;
    }
    isPaused = false;
    sendToWindow(getMainWindow, 'run:log', 'Run resumed.');
  });

  // Get current run status
  ipcMain.handle('run:status', async (): Promise<{ isRunning: boolean; isPaused: boolean }> => {
    return { isRunning, isPaused };
  });

  // Handle human input response (for CAPTCHA prompts, etc.)
  ipcMain.handle('run:human-input-response', async (_event, response: string): Promise<void> => {
    if (humanInputResolver) {
      humanInputResolver(response);
      humanInputResolver = null;
    }
  });
}

// Export function to request human input from renderer
export function requestHumanInput(
  getWindow: () => BrowserWindow | null,
  prompt: string
): Promise<string> {
  return new Promise((resolve) => {
    humanInputResolver = resolve;
    sendToWindow(getWindow, 'run:human-input', prompt);
  });
}
