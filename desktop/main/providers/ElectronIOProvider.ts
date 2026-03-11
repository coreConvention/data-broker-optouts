import { BrowserWindow, shell } from 'electron';

// Structural typing — matches IOProvider interface from src/types.ts
// We use duck typing because the desktop main process is CJS and can't import ESM types directly

interface BrokerLike {
  name: string;
  humanInteraction?: 'modal' | 'browser';
  removalUrl?: string | null;
  [key: string]: unknown;
}

type LogLevel = 'info' | 'warn' | 'error' | 'success';

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

export class ElectronIOProvider {
  private getMainWindow: () => BrowserWindow | null;
  private humanInputResolver: ((value: string) => void) | null = null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  async promptUser(message: string, options?: { broker?: string }): Promise<string> {
    return new Promise<string>((resolve) => {
      this.humanInputResolver = resolve;
      sendToWindow(this.getMainWindow, 'run:human-input', {
        type: 'prompt',
        message,
        broker: options?.broker ?? null,
      });
    });
  }

  async waitForConfirmation(
    message: string,
    options?: { broker?: string; url?: string }
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.humanInputResolver = (_response: string) => {
        resolve();
      };
      sendToWindow(this.getMainWindow, 'run:human-input', {
        type: 'confirmation',
        message,
        broker: options?.broker ?? null,
        url: options?.url ?? null,
      });
    });
  }

  log(level: LogLevel, message: string): void {
    const prefixes: Record<LogLevel, string> = {
      info: '',
      warn: '⚠ ',
      error: '✗ ',
      success: '✓ ',
    };
    sendToWindow(
      this.getMainWindow,
      'run:log',
      `${prefixes[level]}${message}`
    );
  }

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  shouldOpenInBrowser(broker: BrokerLike): boolean {
    return broker.humanInteraction === 'browser';
  }

  /** Called by IPC handler when user responds to a human-input prompt */
  resolveHumanInput(response: string): void {
    if (this.humanInputResolver) {
      this.humanInputResolver(response);
      this.humanInputResolver = null;
    }
  }
}
