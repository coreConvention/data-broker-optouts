import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  StateStore,
  StateFileError,
  HISTORY_CAP,
  applyScan,
  applyRequest,
  applyVerify,
  emptyBrokerRecord,
  personHash
} from "../services/StateStore.js";
import { StateFileSchema } from "../config/schemas.js";

// Invented people only: nothing here describes a real person.
const profile = { fullName: "Testy McFixture", zip: "00000", email: "testy@example.com" };
const otherProfile = { fullName: "Sample Placeholder", zip: "00001", email: "sample@example.com" };

const listingA = { id: "https://broker.example/person/a", url: "https://broker.example/person/a" };
const listingB = { id: "https://broker.example/person/b", url: "https://broker.example/person/b" };

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-17T18:00:00.000Z");
const days = (n: number): Date => new Date(T0.getTime() + n * DAY);

describe("personHash", () => {
  it("is 12 hex characters and ignores case, spacing and ZIP+4", () => {
    const hash = personHash(profile);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    expect(personHash({ fullName: "  testy   MCFIXTURE ", zip: "00000-1234", email: " Testy@Example.com" })).toBe(hash);
  });

  it("differs for a different person", () => {
    expect(personHash(otherProfile)).not.toBe(personHash(profile));
  });

  it("does not contain the name or email", () => {
    const hash = personHash(profile);
    expect(hash).not.toContain("testy");
  });
});

describe("state transitions (plan section 5.1)", () => {
  it("starts unknown", () => {
    expect(emptyBrokerRecord().state).toBe("unknown");
  });

  it("scan that cannot tell gives unknown, never not-found", () => {
    const next = applyScan(emptyBrokerRecord(), { kind: "unknown" }, T0);
    expect(next.state).toBe("unknown");
    expect(next.nextCheckDue).toBeNull();
  });

  it("scan with no listing gives not-found and a re-check date 90 days out", () => {
    const next = applyScan(emptyBrokerRecord(), { kind: "not-found" }, T0);
    expect(next.state).toBe("not-found");
    expect(next.lastScannedAt).toBe(T0.toISOString());
    expect(next.nextCheckDue).toBe(days(90).toISOString());
  });

  it("scan with a confirmed listing gives listed", () => {
    const next = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    expect(next.state).toBe("listed");
    expect(next.listings).toEqual([{ ...listingA, state: "listed", requestAttempts: 0, pending: null }]);
  });

  it("request for every listing gives requested with verifyAfter one window later", () => {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    const next = applyRequest(listed, listingA.id, { kind: "requested" }, T0, { removalWindowDays: 3 });
    expect(next.state).toBe("requested");
    expect(next.lastRequestedAt).toBe(T0.toISOString());
    expect(next.verifyAfter).toBe(days(3).toISOString());
    expect(next.listings[0]!.requestAttempts).toBe(1);
  });

  it("never uses a removal window shorter than 3 days", () => {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    const next = applyRequest(listed, listingA.id, { kind: "requested" }, T0, { removalWindowDays: 1 });
    expect(next.verifyAfter).toBe(days(3).toISOString());
  });

  it("stays listed while one of two listings has no request", () => {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA, listingB] }, T0);
    const next = applyRequest(listed, listingA.id, { kind: "requested" }, T0, { removalWindowDays: 3 });
    expect(next.state).toBe("listed");
  });

  it("a request waiting on the person stays listed with pending recorded", () => {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    const next = applyRequest(listed, listingA.id, { kind: "requested", pending: "phone-call" }, T0, {
      removalWindowDays: 3
    });
    expect(next.state).toBe("listed");
    expect(next.listings[0]).toMatchObject({ state: "listed", pending: "phone-call", requestAttempts: 1 });
    expect(next.verifyAfter).toBeNull();
  });

  it("a request that was not completed leaves the listing listed", () => {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    const next = applyRequest(listed, listingA.id, { kind: "not-completed" }, T0, { removalWindowDays: 3 });
    expect(next.state).toBe("listed");
    expect(next.listings[0]!.requestAttempts).toBe(0);
    expect(next.history.at(-1)).toMatchObject({ event: "request", result: "listed" });
  });

  it("refuses a request for a listing that was never confirmed", () => {
    expect(() =>
      applyRequest(emptyBrokerRecord(), listingA.id, { kind: "requested" }, T0, { removalWindowDays: 3 })
    ).toThrow(/scan first/);
  });

  function requested() {
    const listed = applyScan(emptyBrokerRecord(), { kind: "found", listings: [listingA] }, T0);
    return applyRequest(listed, listingA.id, { kind: "requested" }, T0, { removalWindowDays: 3 });
  }

  it("verify that finds the listing gone gives removed and a re-check date", () => {
    const next = applyVerify(requested(), listingA.id, { kind: "removed" }, days(4));
    expect(next.state).toBe("removed");
    expect(next.lastVerifiedAt).toBe(days(4).toISOString());
    expect(next.nextCheckDue).toBe(days(94).toISOString());
  });

  it("verify that still finds the listing gives listed and keeps the attempt count", () => {
    const next = applyVerify(requested(), listingA.id, { kind: "listed" }, days(4));
    expect(next.state).toBe("listed");
    expect(next.listings[0]!.requestAttempts).toBe(1);
  });

  it("verify that cannot tell gives unknown and keeps the listing", () => {
    const next = applyVerify(requested(), listingA.id, { kind: "unknown" }, days(4));
    expect(next.state).toBe("unknown");
    expect(next.listings[0]!.state).toBe("requested");
  });

  it("a later scan that finds a listing after removed gives relisted, counted once", () => {
    const removed = applyVerify(requested(), listingA.id, { kind: "removed" }, days(4));
    const relisted = applyScan(removed, { kind: "found", listings: [listingA] }, days(95));
    expect(relisted.state).toBe("relisted");
    expect(relisted.timesRelisted).toBe(1);

    // Still there on the next scan: same relisting, not a second one.
    const again = applyScan(relisted, { kind: "found", listings: [listingA] }, days(96));
    expect(again.state).toBe("relisted");
    expect(again.timesRelisted).toBe(1);
  });

  it("a later scan that finds nothing after removed stays removed", () => {
    const removed = applyVerify(requested(), listingA.id, { kind: "removed" }, days(4));
    const next = applyScan(removed, { kind: "not-found" }, days(95));
    expect(next.state).toBe("removed");
    expect(next.nextCheckDue).toBe(days(185).toISOString());
  });

  it("an empty scan does not end a request that is still inside its window", () => {
    const next = applyScan(requested(), { kind: "not-found" }, days(1));
    expect(next.state).toBe("requested");
  });

  it("records who answered when the person did the scan", () => {
    const next = applyScan(emptyBrokerRecord(), { kind: "not-found", source: "person" }, T0);
    expect(next.history.at(-1)).toEqual({ at: T0.toISOString(), event: "scan", result: "not-found", source: "person" });
  });

  it("does not change the record it was given", () => {
    const before = requested();
    const snapshot = structuredClone(before);
    applyVerify(before, listingA.id, { kind: "removed" }, days(4));
    applyScan(before, { kind: "found", listings: [listingB] }, days(4));
    expect(before).toEqual(snapshot);
  });

  it("caps history at 20 entries, keeping the newest", () => {
    let record = emptyBrokerRecord();
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      record = applyScan(record, { kind: "not-found" }, days(i));
    }
    expect(HISTORY_CAP).toBe(20);
    expect(record.history).toHaveLength(HISTORY_CAP);
    expect(record.history[0]!.at).toBe(days(5).toISOString());
    expect(record.history.at(-1)!.at).toBe(days(HISTORY_CAP + 4).toISOString());
  });
});

describe("StateStore", () => {
  let dir: string;
  let file: string;
  let now: Date;
  const clock = (): Date => now;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "state-store-"));
    file = path.join(dir, "data", "state.json");
    now = T0;
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts empty when there is no file and writes nothing until saved", async () => {
    const store = await StateStore.load(file, profile, { now: clock });
    expect(store.getBroker("whitepages")).toEqual(emptyBrokerRecord());
    expect(store.personChanged).toBe(false);
    await expect(fs.access(file)).rejects.toThrow();
  });

  it("round-trips through the file", async () => {
    const store = await StateStore.load(file, profile, { now: clock });
    store.recordScan("whitepages", { kind: "found", listings: [listingA] }, { evidence: "evidence/whitepages/x-scan.png" });
    store.recordRequest("whitepages", listingA.id, { kind: "requested" }, { removalWindowDays: 3 });
    store.markGuidanceShown();
    await store.save();

    const onDisk = JSON.parse(await fs.readFile(file, "utf-8"));
    expect(StateFileSchema.safeParse(onDisk).success).toBe(true);
    expect(onDisk.version).toBe(1);
    expect(onDisk.person).toBe(personHash(profile));

    const reloaded = await StateStore.load(file, profile, { now: clock });
    expect(reloaded.getBroker("whitepages")).toEqual(store.getBroker("whitepages"));
    expect(reloaded.getBroker("whitepages").state).toBe("requested");
    expect(reloaded.guidanceShownAt).toBe(T0.toISOString());
    expect(reloaded.brokerIds()).toEqual(["whitepages"]);
  });

  it("leaves no temporary file behind after a save", async () => {
    const store = await StateStore.load(file, profile, { now: clock });
    store.recordScan("whitepages", { kind: "not-found" });
    await store.save();
    await store.save();
    expect(await fs.readdir(path.dirname(file))).toEqual(["state.json"]);
  });

  it("uses the re-check interval it was given, capped at 120 days", async () => {
    const store = await StateStore.load(file, profile, { now: clock, recheckDays: 400 });
    const record = store.recordScan("whitepages", { kind: "not-found" });
    expect(record.nextCheckDue).toBe(days(120).toISOString());
  });

  it("hands out copies, so a caller cannot change the stored record", async () => {
    const store = await StateStore.load(file, profile, { now: clock });
    store.recordScan("whitepages", { kind: "found", listings: [listingA] });
    store.getBroker("whitepages").listings.length = 0;
    expect(store.getBroker("whitepages").listings).toHaveLength(1);
  });

  describe("a file that cannot be trusted", () => {
    async function writeRaw(content: string): Promise<void> {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, "utf-8");
    }

    it("refuses invalid JSON and leaves the file as it was", async () => {
      const broken = '{ "version": 1, "brokers": { "whitepages": ';
      await writeRaw(broken);

      await expect(StateStore.load(file, profile)).rejects.toBeInstanceOf(StateFileError);
      await expect(StateStore.load(file, profile)).rejects.toThrow(/left as it is/);
      expect(await fs.readFile(file, "utf-8")).toBe(broken);
    });

    it("rejects a file that does not match the schema, without quoting its values", async () => {
      const bad = {
        version: 1,
        person: personHash(profile),
        guidanceShownAt: null,
        brokers: { whitepages: { ...emptyBrokerRecord(), state: "deleted", listings: [{ url: "https://broker.example/secret-name" }] } }
      };
      await writeRaw(JSON.stringify(bad));

      const error = await StateStore.load(file, profile).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StateFileError);
      expect((error as Error).message).toContain("brokers.whitepages");
      expect((error as Error).message).not.toContain("secret-name");
      expect(JSON.parse(await fs.readFile(file, "utf-8"))).toEqual(bad);
    });

    it("refuses a file written by a newer version", async () => {
      await writeRaw(JSON.stringify({ version: 2, person: personHash(profile), guidanceShownAt: null, brokers: {} }));
      await expect(StateStore.load(file, profile)).rejects.toThrow(/version/);
    });

    it("refuses a path it cannot read as a file", async () => {
      await fs.mkdir(file, { recursive: true });
      await expect(StateStore.load(file, profile)).rejects.toBeInstanceOf(StateFileError);
    });
  });

  describe("a file written for a different person", () => {
    beforeEach(async () => {
      const store = await StateStore.load(file, otherProfile, { now: clock });
      store.recordScan("whitepages", { kind: "found", listings: [listingA] });
      store.recordRequest("whitepages", listingA.id, { kind: "requested" }, { removalWindowDays: 3 });
      store.markGuidanceShown();
      await store.save();
    });

    it("reads every broker as unknown", async () => {
      const store = await StateStore.load(file, profile, { now: clock });
      expect(store.personChanged).toBe(true);
      expect(store.getBroker("whitepages")).toEqual(emptyBrokerRecord());
      expect(store.guidanceShownAt).toBeNull();
    });

    it("is not rewritten by loading alone", async () => {
      const before = await fs.readFile(file, "utf-8");
      await StateStore.load(file, profile, { now: clock });
      expect(await fs.readFile(file, "utf-8")).toBe(before);
    });

    it("is replaced with the new person's entries on save", async () => {
      const store = await StateStore.load(file, profile, { now: clock });
      store.recordScan("spokeo", { kind: "not-found" });
      await store.save();

      const onDisk = JSON.parse(await fs.readFile(file, "utf-8"));
      expect(onDisk.person).toBe(personHash(profile));
      expect(Object.keys(onDisk.brokers)).toEqual(["spokeo"]);
    });

    it("is trusted again by the person it was written for", async () => {
      const store = await StateStore.load(file, otherProfile, { now: clock });
      expect(store.personChanged).toBe(false);
      expect(store.getBroker("whitepages").state).toBe("requested");
    });
  });
});

describe(".gitignore", () => {
  // The state file and evidence screenshots carry the person's name and
  // address; they must never be committable by accident.
  const ignored = (target: string): boolean => {
    try {
      execFileSync("git", ["check-ignore", "-q", target], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  it("ignores the state file and its temporary file", () => {
    expect(ignored("data/state.json")).toBe(true);
    expect(ignored("data/state.json.1234.tmp")).toBe(true);
  });

  it("ignores everything in the evidence folder, whatever the format", () => {
    expect(ignored("data/evidence/x.png")).toBe(true);
    expect(ignored("data/evidence/whitepages/20261117T180500-scan.webp")).toBe(true);
  });

  it("still tracks the manifest (the check can fail)", () => {
    expect(ignored("data/manifest.json")).toBe(false);
  });
});
