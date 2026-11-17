import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { BrowserFactory } from "../factories/BrowserFactory.js";

// Real headless Chromium against a server on 127.0.0.1, never a real site:
// what a site would see of the browser's language with stealth on (#58).
describe("stealth language, as a site sees it", () => {
  let browser: Browser;
  let server: http.Server;
  let url: string;
  const headers: Array<string | undefined> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      headers.push(req.headers["accept-language"]);
      res.end("<html><body>ok</body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    headers.length = 0;
  });

  it("reports the machine's language in the page and in the request header", async () => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return { ...real.call(this), locale: "de-DE" };
      }
    );

    const context = await BrowserFactory.createContext(browser, { headful: false, stealth: true });
    try {
      const page = await context.newPage();
      await page.goto(url);
      const seen = await page.evaluate(() => ({
        language: navigator.language,
        languages: [...navigator.languages]
      }));

      expect(seen.language).toBe("de-DE");
      expect(seen.languages).toEqual(["de-DE", "de"]);
      expect(headers[0]).toBe("de-DE");
    } finally {
      await context.close();
    }
  });
});
