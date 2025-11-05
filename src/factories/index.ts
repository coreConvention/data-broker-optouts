/**
 * Factories Module Barrel Export
 *
 * Provides a single entry point for all factory-related exports
 * including adapter creation and browser/context setup.
 *
 * @module factories
 */

// Adapter Factory
export { AdapterFactory } from "./AdapterFactory.js";

// Browser Factory
export { BrowserFactory } from "./BrowserFactory.js";
export type { BrowserConfig } from "./BrowserFactory.js";
