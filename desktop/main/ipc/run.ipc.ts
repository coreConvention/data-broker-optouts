import { IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { getDataPath } from './config.ipc';
import { ElectronIOProvider } from '../providers/ElectronIOProvider';

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

// State
let isRunning = false;
let isPaused = false;
let shouldStop = false;
let electronIOProvider: ElectronIOProvider | null = null;
let currentOrchestrator: { requestStop: () => void; requestPause: () => void; requestResume: () => void } | null = null;

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

  ipcMain.handle('run:start', async (_event, options: RunOptions): Promise<void> => {
    if (isRunning) {
      throw new Error('A run is already in progress');
    }

    isRunning = true;
    isPaused = false;
    shouldStop = false;

    // Resolve compiled engine path (from dist/main/ipc/ -> dist/engine/)
    const engineBase = path.join(__dirname, '../../engine');

    let browser: { close: () => Promise<void> } | null = null;
    let context: { close: () => Promise<void> } | null = null;

    try {
      // Dynamic import of compiled ESM engine modules. Node's ESM loader rejects
      // Windows absolute paths ("C:\..." parses as an unknown "c:" URL scheme), so
      // every path is converted to a file:// URL first.
      const toURL = (p: string) => pathToFileURL(p).href;
      const browserFactoryMod = await import(toURL(path.join(engineBase, 'factories/BrowserFactory.js')));
      const orchestratorMod = await import(toURL(path.join(engineBase, 'services/ExecutionOrchestrator.js')));
      const loggerMod = await import(toURL(path.join(engineBase, 'utils/logger.js')));
      const configLoaderMod = await import(toURL(path.join(engineBase, 'services/ConfigLoader.js')));
      const brokerFilterMod = await import(toURL(path.join(engineBase, 'services/BrokerFilter.js')));

      const BrowserFactory = browserFactoryMod.BrowserFactory;
      const ExecutionOrchestrator = orchestratorMod.ExecutionOrchestrator;
      const Logger = loggerMod.Logger;
      const ConfigLoader = configLoaderMod.ConfigLoader;
      const BrokerFilter = brokerFilterMod.BrokerFilter;

      const dataPath = getDataPath();
      const manifestPath = path.join(dataPath, 'manifest.json');
      const profilePath = path.join(dataPath, 'profile.json');

      if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest file not found. Please check your data directory.');
      }
      if (!fs.existsSync(profilePath)) {
        throw new Error('Profile file not found. Please create a profile first.');
      }

      // Load and validate config via Zod schemas
      const { manifest, profile } = await ConfigLoader.loadAll(manifestPath, profilePath);

      // Apply filters (BrokerFilter.filter takes comma-separated strings)
      let brokers = BrokerFilter.filter(
        manifest,
        options.filter ? options.filter.join(',') : undefined,
        options.exclude ? options.exclude.join(',') : undefined
      );
      if (options.limit && options.limit > 0) {
        brokers = BrokerFilter.limit(brokers, options.limit);
      }

      const total = brokers.length;
      if (total === 0) {
        throw new Error('No brokers to process after filtering.');
      }

      // Setup logger
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logger = new Logger(dataPath, `optouts-${timestamp}.jsonl`);

      // Create IO provider that bridges engine events to the renderer
      electronIOProvider = new ElectronIOProvider(getMainWindow);

      sendToWindow(getMainWindow, 'run:log', `Starting opt-out process for ${total} brokers...`);

      // Create browser via real BrowserFactory
      const browserResult = await BrowserFactory.createBrowserWithContext({
        headful: options.headful ?? true,
        stealth: options.stealth ?? true,
      });
      browser = browserResult.browser;
      context = browserResult.context;

      // Create orchestrator with ElectronIOProvider for human-in-the-loop
      const orchestrator = new ExecutionOrchestrator(logger, {
        dryRun: options.dryRun ?? false,
        delayBetweenBrokers: 2000,
      }, electronIOProvider);
      currentOrchestrator = orchestrator;

      // Execute all broker opt-outs
      await orchestrator.executeAll(brokers, profile, context);

      // Get statistics from the orchestrator
      const stats = orchestrator.getStatistics().getStatistics();

      const completeData: CompleteData = {
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped,
        manual: stats.manualNeeded,
        total,
        logFile: logger.path(),
      };
      sendToWindow(getMainWindow, 'run:complete', completeData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      sendToWindow(getMainWindow, 'run:log', `Fatal error: ${errorMessage}`);
      sendToWindow(getMainWindow, 'run:complete', {
        success: 0, failed: 0, skipped: 0, manual: 0, total: 0, logFile: '',
      });
      throw error;
    } finally {
      try {
        if (context && typeof context.close === 'function') await context.close();
        if (browser && typeof browser.close === 'function') await browser.close();
      } catch {
        // Ignore cleanup errors
      }

      isRunning = false;
      isPaused = false;
      shouldStop = false;
      electronIOProvider = null;
      currentOrchestrator = null;
    }
  });

  // Stop the current run
  ipcMain.handle('run:stop', async (): Promise<void> => {
    if (!isRunning) return;
    shouldStop = true;
    if (currentOrchestrator) currentOrchestrator.requestStop();
    sendToWindow(getMainWindow, 'run:log', 'Stopping run...');
  });

  // Pause the current run
  ipcMain.handle('run:pause', async (): Promise<void> => {
    if (!isRunning || isPaused) return;
    isPaused = true;
    if (currentOrchestrator) currentOrchestrator.requestPause();
    sendToWindow(getMainWindow, 'run:log', 'Run paused.');
  });

  // Resume a paused run
  ipcMain.handle('run:resume', async (): Promise<void> => {
    if (!isRunning || !isPaused) return;
    isPaused = false;
    if (currentOrchestrator) currentOrchestrator.requestResume();
    sendToWindow(getMainWindow, 'run:log', 'Run resumed.');
  });

  // Get current run status
  ipcMain.handle('run:status', async (): Promise<{ isRunning: boolean; isPaused: boolean }> => {
    return { isRunning, isPaused };
  });

  // Handle human input response (for CAPTCHA prompts, email verification, etc.)
  ipcMain.handle('run:human-input-response', async (_event, response: string): Promise<void> => {
    if (electronIOProvider) {
      electronIOProvider.resolveHumanInput(response);
    }
  });
}
