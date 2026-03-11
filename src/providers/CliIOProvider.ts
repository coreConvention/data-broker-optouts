import type { IOProvider, BrokerEntry } from "../types.js";
import { waitForEnter, promptForCode } from "../utils/human.js";

/**
 * CLI implementation of IOProvider.
 *
 * Wraps the existing readline-based helpers (`waitForEnter`, `promptForCode`)
 * so the execution orchestrator can interact with the user through the
 * terminal. The CLI provider always drives Playwright directly — it never
 * opens an external browser window.
 */
export class CliIOProvider implements IOProvider {
  async promptUser(message: string): Promise<string> {
    return promptForCode(message);
  }

  async waitForConfirmation(message: string): Promise<void> {
    await waitForEnter(message);
  }

  log(level: "info" | "warn" | "error" | "success", message: string): void {
    const prefixes: Record<string, string> = {
      info: "",
      warn: "    \u26a0 ",
      error: "    \u2717 ",
      success: "    \u2713 ",
    };
    console.log(`${prefixes[level]}${message}`);
  }

  async openExternal(_url: string): Promise<void> {
    // CLI doesn't open external URLs — the browser is already visible in headful mode
  }

  shouldOpenInBrowser(_broker: BrokerEntry): boolean {
    // CLI always uses Playwright directly, never external browser
    return false;
  }
}
