import { describe, expect, it } from "vitest";
import { StorageError } from "../src/storage/driver";
import { HealthStore } from "../src/storage/healthStore";
import { currentVersion, SCHEMA_VERSION } from "../src/storage/schema";
import { failingDriver, memoryDriver } from "./helpers";

const TODAY = "2026-03-15";
const A = "user-a";
const B = "user-b";

async function freshStore() {
  const driver = await memoryDriver();
  return { driver, store: await HealthStore.open(driver) };
}

describe("database initialization", () => {
  it("creates the schema and records its version", async () => {
    const { driver } = await freshStore();
    expect(await currentVersion(driver)).toBe(SCHEMA_VERSION);
    const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(["cycle_profile", "daily_entry", "daily_symptom", "period_start", "checklist_item", "preference", "schema_meta"]),
    );
  });

  it("is idempotent when opened again", async () => {
    const { driver } = await freshStore();
    await HealthStore.open(driver);
    expect(await currentVersion(driver)).toBe(SCHEMA_VERSION);
  });

  it("refuses a database from a newer app version instead of overwriting it", async () => {
    const driver = await memoryDriver();
    await driver.exec("CREATE TABLE schema_meta (meta_key TEXT PRIMARY KEY, meta_value TEXT NOT NULL); INSERT INTO schema_meta VALUES ('version', '999');");
    await expect(HealthStore.open(driver)).rejects.toThrow(/newer version/);
  });
});

describe("cycle profile", () => {
  it("saves and retrieves the profile", async () => {
    const { store } = await freshStore();
    expect(await store.getCycleProfile(A)).toBeNull();
    await store.saveCycleProfile(A, { cycleLength: 30, periodLength: 6, lastPeriodStart: "2026-03-01" }, TODAY);
    expect(await store.getCycleProfile(A)).toMatchObject({ cycleLength: 30, periodLength: 6, lastPeriodStart: "2026-03-01" });
  });

  it("accepts the full allowed ranges and rejects values outside them", async () => {
    const { store } = await freshStore();
    await expect(store.saveCycleProfile(A, { cycleLength: 15, periodLength: 1, lastPeriodStart: null }, TODAY)).resolves.toBeTruthy();
    await expect(store.saveCycleProfile(A, { cycleLength: 90, periodLength: 15, lastPeriodStart: null }, TODAY)).resolves.toBeTruthy();
    await expect(store.saveCycleProfile(A, { cycleLength: 14, periodLength: 5, lastPeriodStart: null }, TODAY)).rejects.toThrow(StorageError);
    await expect(store.saveCycleProfile(A, { cycleLength: 91, periodLength: 5, lastPeriodStart: null }, TODAY)).rejects.toThrow(/between 15 and 90/);
    await expect(store.saveCycleProfile(A, { cycleLength: 28, periodLength: 0, lastPeriodStart: null }, TODAY)).rejects.toThrow(/between 1 and 15/);
    await expect(store.saveCycleProfile(A, { cycleLength: 28, periodLength: 16, lastPeriodStart: null }, TODAY)).rejects.toThrow(/between 1 and 15/);
    await expect(store.saveCycleProfile(A, { cycleLength: 28, periodLength: 5, lastPeriodStart: "2026-04-01" }, TODAY)).rejects.toThrow(/future/);
    await expect(store.saveCycleProfile(A, { cycleLength: 28, periodLength: 5, lastPeriodStart: "2026-02-30" }, TODAY)).rejects.toThrow(/valid calendar date/);
  });

  it("updates an existing profile but keeps its completion time", async () => {
    const { store } = await freshStore();
    const first = await store.saveCycleProfile(A, { cycleLength: 28, periodLength: 5, lastPeriodStart: null }, TODAY);
    const second = await store.saveCycleProfile(A, { cycleLength: 32, periodLength: 4, lastPeriodStart: "2026-03-10" }, TODAY);
    expect(second.completedAt).toBe(first.completedAt);
    expect((await store.getCycleProfile(A))?.cycleLength).toBe(32);
  });
});

describe("daily entries", () => {
  it("saves and retrieves a mood entry", async () => {
    const { store } = await freshStore();
    await store.saveDay(A, TODAY, { mood: "good" }, TODAY);
    expect((await store.getDay(A, TODAY))?.mood).toBe("good");
  });

  it("merges updates across categories instead of creating duplicates", async () => {
    const { store, driver } = await freshStore();
    await store.saveDay(A, TODAY, { mood: "low" }, TODAY);
    await store.saveDay(A, TODAY, { energy: 2, sleepHours: 6.5, sleepQuality: 3 }, TODAY);
    await store.saveDay(A, TODAY, { waterMl: 1500, flow: "medium" }, TODAY);
    await store.saveDay(A, TODAY, { symptoms: [{ name: "cramps", severity: 3 }, { name: "headache", severity: 1 }] }, TODAY);
    await store.saveDay(A, TODAY, { mood: "okay" }, TODAY);

    const day = await store.getDay(A, TODAY);
    expect(day).toMatchObject({ mood: "okay", energy: 2, sleepHours: 6.5, sleepQuality: 3, waterMl: 1500, flow: "medium" });
    expect(day?.symptoms).toEqual([
      { name: "cramps", severity: 3 },
      { name: "headache", severity: 1 },
    ]);
    const rows = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM daily_entry");
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("clears fields with null and deletes a day that becomes empty", async () => {
    const { store } = await freshStore();
    await store.saveDay(A, TODAY, { mood: "great", symptoms: [{ name: "acne", severity: 1 }] }, TODAY);
    await store.saveDay(A, TODAY, { mood: null }, TODAY);
    expect((await store.getDay(A, TODAY))?.mood).toBeNull();
    const result = await store.saveDay(A, TODAY, { symptoms: [] }, TODAY);
    expect(result).toBeNull();
    expect(await store.getDay(A, TODAY)).toBeNull();
  });

  it("deletes a whole day", async () => {
    const { store } = await freshStore();
    await store.saveDay(A, TODAY, { mood: "great", symptoms: [{ name: "acne", severity: 1 }] }, TODAY);
    await store.setChecklistItem(A, TODAY, "water", true);
    await store.deleteDay(A, TODAY);
    expect(await store.getDay(A, TODAY)).toBeNull();
    expect(await store.getChecklist(A, TODAY)).toEqual({});
  });

  it("validates input", async () => {
    const { store } = await freshStore();
    await expect(store.saveDay(A, "2026-03-16", { mood: "good" }, TODAY)).rejects.toThrow(/future/);
    await expect(store.saveDay(A, TODAY, { energy: 7 }, TODAY)).rejects.toThrow(/Energy/);
    await expect(store.saveDay(A, TODAY, { sleepHours: 25 }, TODAY)).rejects.toThrow(/Sleep/);
    await expect(
      store.saveDay(A, TODAY, { symptoms: [{ name: "cramps", severity: 1 }, { name: "cramps", severity: 2 }] }, TODAY),
    ).rejects.toThrow(/Duplicate/);
    await expect(store.saveDay(A, TODAY, { mood: "ecstatic" as never }, TODAY)).rejects.toThrow(/mood/);
  });

  it("lists days in a range in date order", async () => {
    const { store } = await freshStore();
    await store.saveDay(A, "2026-03-10", { mood: "good" }, TODAY);
    await store.saveDay(A, "2026-03-02", { energy: 3 }, TODAY);
    await store.saveDay(A, "2026-02-20", { energy: 3 }, TODAY);
    const days = await store.listDays(A, "2026-03-01", "2026-03-31");
    expect(days.map((d) => d.date)).toEqual(["2026-03-02", "2026-03-10"]);
  });
});

describe("period starts, checklist and preferences", () => {
  it("adds without duplicates and removes period starts", async () => {
    const { store } = await freshStore();
    await store.addPeriodStart(A, "2026-02-14", TODAY);
    await store.addPeriodStart(A, "2026-03-12", TODAY);
    await store.addPeriodStart(A, "2026-03-12", TODAY);
    expect(await store.listPeriodStarts(A)).toEqual(["2026-03-12", "2026-02-14"]);
    await store.removePeriodStart(A, "2026-02-14");
    expect(await store.listPeriodStarts(A)).toEqual(["2026-03-12"]);
    await expect(store.addPeriodStart(A, "2026-04-01", TODAY)).rejects.toThrow(/future/);
  });

  it("persists checklist toggles and preferences", async () => {
    const { store } = await freshStore();
    await store.setChecklistItem(A, TODAY, "water", true);
    await store.setChecklistItem(A, TODAY, "move", false);
    await store.setChecklistItem(A, TODAY, "water", false);
    expect(await store.getChecklist(A, TODAY)).toEqual({ water: false, move: false });
    await store.setPreference(A, "water_goal_glasses", "10");
    expect(await store.getPreferences(A)).toEqual({ water_goal_glasses: "10" });
  });
});

describe("persistence", () => {
  it("keeps records after a simulated app restart", async () => {
    const { driver, store } = await freshStore();
    await store.saveCycleProfile(A, { cycleLength: 29, periodLength: 5, lastPeriodStart: "2026-03-01" }, TODAY);
    await store.saveDay(A, TODAY, { mood: "great", symptoms: [{ name: "bloating", severity: 2 }] }, TODAY);
    const image = driver.export();
    await driver.close();

    const reopened = await HealthStore.open(await memoryDriver(image));
    expect((await reopened.getCycleProfile(A))?.cycleLength).toBe(29);
    expect(await reopened.getDay(A, TODAY)).toMatchObject({ mood: "great", symptoms: [{ name: "bloating", severity: 2 }] });
  });
});

describe("failure handling", () => {
  it("reports failed writes and keeps existing data intact", async () => {
    const base = await memoryDriver();
    const { driver, control } = failingDriver(base);
    const store = await HealthStore.open(driver);
    await store.saveDay(A, TODAY, { mood: "good" }, TODAY);

    control.failWrites = true;
    await expect(store.saveDay(A, TODAY, { mood: "low" }, TODAY)).rejects.toThrow(/not saved/);
    await expect(store.saveCycleProfile(A, { cycleLength: 28, periodLength: 5, lastPeriodStart: null }, TODAY)).rejects.toThrow(StorageError);
    control.failWrites = false;
    expect((await store.getDay(A, TODAY))?.mood).toBe("good");
  });

  it("fails to open rather than falling back to memory when initialization fails", async () => {
    const base = await memoryDriver();
    const { driver, control } = failingDriver(base);
    control.failWrites = true;
    await expect(HealthStore.open(driver)).rejects.toThrow(StorageError);
  });

  it("rejects operations without a user", async () => {
    const { store } = await freshStore();
    await expect(store.getCycleProfile("")).rejects.toThrow(/signed-in user/);
  });
});

describe("user isolation", () => {
  it("never returns another user's records and deletes only the current user's", async () => {
    const { store } = await freshStore();
    await store.saveCycleProfile(A, { cycleLength: 28, periodLength: 5, lastPeriodStart: "2026-03-01" }, TODAY);
    await store.saveDay(A, TODAY, { mood: "great", notes: "private to A" }, TODAY);
    await store.addPeriodStart(A, "2026-03-01", TODAY);

    expect(await store.getCycleProfile(B)).toBeNull();
    expect(await store.getDay(B, TODAY)).toBeNull();
    expect(await store.listPeriodStarts(B)).toEqual([]);
    expect(await store.listDays(B, "2026-01-01", TODAY)).toEqual([]);

    await store.saveDay(B, TODAY, { mood: "low" }, TODAY);
    await store.deleteAllForUser(B);
    expect(await store.getDay(B, TODAY)).toBeNull();
    expect((await store.getDay(A, TODAY))?.notes).toBe("private to A");
    expect(await store.countRecords(A)).toEqual({ days: 1, periodStarts: 1, hasProfile: true });

    await store.deleteAllForUser(A);
    expect(await store.countRecords(A)).toEqual({ days: 0, periodStarts: 0, hasProfile: false });
  });
});
