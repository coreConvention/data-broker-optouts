import { promises as fs } from "fs";
import path from "path";
import type { Page } from "@playwright/test";

/** The moments a screenshot is kept for (design plan section 5.3), plus an adapter error. */
export type EvidenceEvent = "scan" | "request" | "verify" | "error";

/** A second screenshot in the same second gets "-2", and so on up to this. */
const MAX_SAME_SECOND = 50;

/**
 * The one place screenshots are written (design plan section 5.3).
 *
 * Screenshots show the person's name and address, so they all live in one
 * local folder that git ignores: `data/evidence/<brokerId>/<timestamp>-<event>.png`
 * for the CLI, the same folder under the app's data directory for the desktop
 * app. Nothing here uploads or sends a file anywhere.
 *
 * File names carry the broker and the time, never anything about the person.
 * `capture` returns the path relative to the data directory, which is what
 * the state file's history stores.
 */
export class EvidenceStore {
  private readonly now: () => Date;

  /**
   * @param dir - The evidence folder itself, e.g. `data/evidence`
   * @param now - Clock for file names, so tests can set the time
   */
  constructor(
    private readonly dir: string,
    now?: () => Date
  ) {
    this.now = now ?? (() => new Date());
  }

  /**
   * A broker name or id as a folder name: lower-case letters, digits and
   * dashes only, so it cannot step outside the evidence folder.
   */
  public static folderName(broker: string): string {
    const slug = broker
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "broker";
  }

  /**
   * Save a full-page screenshot of the page as it is now.
   *
   * Never throws: a screenshot that cannot be saved must not undo or fail the
   * step it records. The caller decides whether to say so.
   *
   * @param page - The page to capture
   * @param broker - The broker's id (listing adapters) or name (older adapters)
   * @param event - What the screenshot records
   * @returns `evidence/<broker>/<timestamp>-<event>.png`, or null when it could not be saved
   */
  public async capture(page: Page, broker: string, event: EvidenceEvent): Promise<string | null> {
    const folderName = EvidenceStore.folderName(broker);
    const stamp = this.now()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "");

    try {
      // Taken into memory and written here, so no other code decides where an
      // image with personal details lands.
      const image = await page.screenshot({ fullPage: true });
      const folder = path.join(this.dir, folderName);
      await fs.mkdir(folder, { recursive: true });

      for (let attempt = 1; attempt <= MAX_SAME_SECOND; attempt++) {
        const fileName = attempt === 1 ? `${stamp}-${event}.png` : `${stamp}-${event}-${attempt}.png`;
        try {
          // "wx": never write over an earlier screenshot.
          await fs.writeFile(path.join(folder, fileName), image, { flag: "wx", mode: 0o600 });
          return `evidence/${folderName}/${fileName}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
