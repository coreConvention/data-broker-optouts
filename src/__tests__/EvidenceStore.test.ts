import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { BrowserContext, Page } from "@playwright/test";
import type { BrokerEntry, IOProvider, PersonProfile } from "../types.js";
import { BaseAdapter } from "../adapters/BaseAdapter.js";
import { EvidenceStore } from "../services/EvidenceStore.js";

const T0 = new Date("2026-11-17T18:05:09.123Z");
const STAMP = "20261117T180509";

// Invented person: a match in a file name or log line can only be a leak.
const profile: PersonProfile = {
  fullName: "Zephyrine Quillfeather",
  email: "zq-primary@example.test",
  zip: "99887",
};

describe("EvidenceStore", () => {
  let dir: string;
  let evidenceDir: string;
  let store: EvidenceStore;
  const page = {
    screenshot: vi.fn(async (_options?: unknown) => Buffer.from("not really a png")),
  };
  const asPage = page as unknown as Page;

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-"));
    evidenceDir = path.join(dir, "evidence");
    store = new EvidenceStore(evidenceDir, () => T0);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes <brokerId>/<timestamp>-<event>.png and returns the path relative to the data directory", async () => {
    const saved = await store.capture(asPage, "whitepages", "scan");

    expect(saved).toBe(`evidence/whitepages/${STAMP}-scan.png`);
    expect(await fs.readFile(path.join(dir, saved!), "utf-8")).toBe("not really a png");
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true });
  });

  it("never writes over an earlier screenshot from the same second", async () => {
    const one = await store.capture(asPage, "whitepages", "verify");
    page.screenshot.mockResolvedValueOnce(Buffer.from("second"));
    const two = await store.capture(asPage, "whitepages", "verify");

    expect(one).toBe(`evidence/whitepages/${STAMP}-verify.png`);
    expect(two).toBe(`evidence/whitepages/${STAMP}-verify-2.png`);
    expect(await fs.readFile(path.join(dir, one!), "utf-8")).toBe("not really a png");
    expect(await fs.readFile(path.join(dir, two!), "utf-8")).toBe("second");
  });

  it("turns a broker name into a folder name that cannot leave the evidence folder", async () => {
    expect(EvidenceStore.folderName("Precise Leads (NumLookup)")).toBe("precise-leads-numlookup");
    expect(EvidenceStore.folderName("../../somewhere/else")).toBe("somewhere-else");
    expect(EvidenceStore.folderName("...")).toBe("broker");

    const saved = await store.capture(asPage, "..\\..\\outside", "error");

    expect(saved).toBe(`evidence/outside/${STAMP}-error.png`);
    expect(await fs.readdir(dir)).toEqual(["evidence"]);
  });

  it("returns null instead of throwing when the screenshot fails", async () => {
    page.screenshot.mockRejectedValueOnce(new Error("Target page, context or browser has been closed"));

    await expect(store.capture(asPage, "whitepages", "request")).resolves.toBeNull();
    await expect(fs.access(evidenceDir)).rejects.toThrow();
  });

  it("returns null instead of throwing when the folder cannot be made", async () => {
    await fs.writeFile(evidenceDir, "a file where the folder should be");

    await expect(store.capture(asPage, "whitepages", "request")).resolves.toBeNull();
  });
});

describe("BaseAdapter error screenshot", () => {
  class FailingAdapter extends BaseAdapter {
    public name(): string {
      return "Failing";
    }
    protected async execute(): Promise<void> {
      throw new Error("the form was not where it was expected");
    }
  }

  const entry: BrokerEntry = {
    name: "Some Broker (US)",
    removalUrl: "https://broker.example/optout",
    requirements: ["online"],
    adapter: "generic",
  };

  let dir: string;
  let io: IOProvider;
  const page = {
    goto: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn(async (_options?: unknown) => Buffer.from("not really a png")),
  };
  const context = { newPage: vi.fn(async () => page) } as unknown as BrowserContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "error-shot-"));
    io = {
      promptUser: vi.fn().mockResolvedValue(""),
      waitForConfirmation: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shouldOpenInBrowser: vi.fn().mockReturnValue(false),
    };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("goes to the evidence folder, named by broker and time, and not to ./logs", async () => {
    const evidence = new EvidenceStore(path.join(dir, "evidence"), () => T0);

    await expect(new FailingAdapter(entry).run(context, profile, { ioProvider: io, evidence })).rejects.toThrow(
      "the form was not where it was expected"
    );

    expect(await fs.readdir(path.join(dir, "evidence", "some-broker-us"))).toEqual([`${STAMP}-error.png`]);
    // The page was not told to write a file itself, so nothing lands in ./logs.
    expect(page.screenshot.mock.calls).toEqual([[{ fullPage: true }]]);

    const lines = vi.mocked(io.log).mock.calls.map(([, message]) => String(message));
    expect(lines).toContain(
      `[Failing] Screenshot saved in your data folder: evidence/some-broker-us/${STAMP}-error.png`
    );
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("takes no screenshot at all when the run has no evidence folder", async () => {
    await expect(new FailingAdapter(entry).run(context, profile, { ioProvider: io })).rejects.toThrow();

    expect(page.screenshot).not.toHaveBeenCalled();
  });
});
