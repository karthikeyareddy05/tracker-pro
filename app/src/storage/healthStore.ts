import { validateCycleInput, type CycleProfile } from "../lib/cycle";
import { compareDates, isDateStr, type DateStr } from "../lib/dates";
import { StorageError, type SqlDriver, type SqlStatement } from "./driver";
import { migrate } from "./schema";

export const MOODS = ["great", "good", "okay", "low", "anxious", "irritable"] as const;
export type Mood = (typeof MOODS)[number];

export const FLOWS = ["none", "spotting", "light", "medium", "heavy"] as const;
export type Flow = (typeof FLOWS)[number];

export const SYMPTOMS = [
  "cramps",
  "headache",
  "bloating",
  "back_pain",
  "breast_tenderness",
  "acne",
  "fatigue",
  "nausea",
  "cravings",
  "mood_swings",
] as const;
export type SymptomName = (typeof SYMPTOMS)[number];
export type Severity = 1 | 2 | 3;

export interface Symptom {
  name: SymptomName;
  severity: Severity;
}

export interface DayFields {
  mood: Mood | null;
  energy: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  waterMl: number | null;
  flow: Flow | null;
  notes: string | null;
}

export interface DayEntry extends DayFields {
  date: DateStr;
  symptoms: Symptom[];
  updatedAt: string | null;
}

export const EMPTY_FIELDS: DayFields = {
  mood: null,
  energy: null,
  sleepHours: null,
  sleepQuality: null,
  waterMl: null,
  flow: null,
  notes: null,
};

export interface CycleProfileInput {
  cycleLength: number;
  periodLength: number;
  lastPeriodStart: DateStr | null;
}

interface DayRow {
  entry_date: string;
  mood: string | null;
  energy: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  water_ml: number | null;
  flow: string | null;
  notes: string | null;
  updated_at: string;
}

function assertUser(userId: string) {
  if (!userId || typeof userId !== "string") throw new StorageError("No signed-in user for this operation.");
}

function assertDate(date: string, label = "Date"): asserts date is DateStr {
  if (!isDateStr(date)) throw new StorageError(`${label} is not a valid calendar date.`);
}

function validateFields(fields: DayFields): void {
  if (fields.mood !== null && !MOODS.includes(fields.mood)) throw new StorageError("Unknown mood.");
  if (fields.flow !== null && !FLOWS.includes(fields.flow)) throw new StorageError("Unknown flow level.");
  const intIn = (v: number | null, min: number, max: number, label: string) => {
    if (v !== null && (!Number.isInteger(v) || v < min || v > max)) {
      throw new StorageError(`${label} must be between ${min} and ${max}.`);
    }
  };
  intIn(fields.energy, 1, 5, "Energy");
  intIn(fields.sleepQuality, 1, 5, "Sleep quality");
  intIn(fields.waterMl, 0, 10_000, "Water");
  if (fields.sleepHours !== null && (!Number.isFinite(fields.sleepHours) || fields.sleepHours < 0 || fields.sleepHours > 24)) {
    throw new StorageError("Sleep must be between 0 and 24 hours.");
  }
  if (fields.notes !== null && fields.notes.length > 2000) throw new StorageError("Notes are limited to 2,000 characters.");
}

function isEmpty(fields: DayFields, symptoms: Symptom[]): boolean {
  return (
    symptoms.length === 0 &&
    Object.values(fields).every((v) => v === null || (typeof v === "string" && v.trim() === ""))
  );
}

function rowToFields(row: DayRow): DayFields {
  return {
    mood: (row.mood as Mood | null) ?? null,
    energy: row.energy ?? null,
    sleepHours: row.sleep_hours ?? null,
    sleepQuality: row.sleep_quality ?? null,
    waterMl: row.water_ml ?? null,
    flow: (row.flow as Flow | null) ?? null,
    notes: row.notes ?? null,
  };
}

/**
 * All private health records, stored only on this device and always scoped to
 * a user id so several accounts on one phone never see each other's data.
 */
export class HealthStore {
  constructor(
    private readonly driver: SqlDriver,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  static async open(driver: SqlDriver, clock?: () => Date): Promise<HealthStore> {
    try {
      await migrate(driver);
    } catch (error) {
      throw new StorageError(
        error instanceof Error && error.message.includes("newer version")
          ? error.message
          : "On-device storage could not be prepared.",
        error,
      );
    }
    return new HealthStore(driver, clock);
  }

  get kind() {
    return this.driver.kind;
  }

  private nowIso() {
    return this.clock().toISOString();
  }

  private async write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("Couldn't save to on-device storage. Your change was not saved.", error);
    }
  }

  private async read<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("Couldn't read on-device storage.", error);
    }
  }

  /* ----------------------------- cycle profile ----------------------------- */

  async getCycleProfile(userId: string): Promise<CycleProfile | null> {
    assertUser(userId);
    return this.read(async () => {
      const rows = await this.driver.query<{
        cycle_length: number;
        period_length: number;
        last_period_start: string | null;
        completed_at: string;
        updated_at: string;
      }>(
        "SELECT cycle_length, period_length, last_period_start, completed_at, updated_at FROM cycle_profile WHERE user_id = ?",
        [userId],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        cycleLength: Number(r.cycle_length),
        periodLength: Number(r.period_length),
        lastPeriodStart: r.last_period_start ?? null,
        completedAt: r.completed_at,
        updatedAt: r.updated_at,
      };
    });
  }

  async saveCycleProfile(userId: string, input: CycleProfileInput, today: DateStr): Promise<CycleProfile> {
    assertUser(userId);
    const problem = validateCycleInput(input.cycleLength, input.periodLength);
    if (problem) throw new StorageError(problem);
    if (input.lastPeriodStart !== null) {
      assertDate(input.lastPeriodStart, "Last period start");
      if (compareDates(input.lastPeriodStart, today) > 0) {
        throw new StorageError("The last period start can't be in the future.");
      }
    }
    return this.write(async () => {
      const existing = await this.getCycleProfile(userId);
      const now = this.nowIso();
      const completedAt = existing?.completedAt ?? now;
      await this.driver.run(
        `INSERT OR REPLACE INTO cycle_profile (user_id, cycle_length, period_length, last_period_start, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, input.cycleLength, input.periodLength, input.lastPeriodStart, completedAt, now],
      );
      return {
        cycleLength: input.cycleLength,
        periodLength: input.periodLength,
        lastPeriodStart: input.lastPeriodStart,
        completedAt,
        updatedAt: now,
      };
    });
  }

  /* ----------------------------- period starts ----------------------------- */

  async listPeriodStarts(userId: string): Promise<DateStr[]> {
    assertUser(userId);
    return this.read(async () => {
      const rows = await this.driver.query<{ start_date: string }>(
        "SELECT start_date FROM period_start WHERE user_id = ? ORDER BY start_date DESC",
        [userId],
      );
      return rows.map((r) => r.start_date);
    });
  }

  async addPeriodStart(userId: string, date: DateStr, today: DateStr): Promise<void> {
    assertUser(userId);
    assertDate(date);
    if (compareDates(date, today) > 0) throw new StorageError("You can't log a period start in the future.");
    await this.write(() =>
      this.driver.run("INSERT OR IGNORE INTO period_start (user_id, start_date, created_at) VALUES (?, ?, ?)", [
        userId,
        date,
        this.nowIso(),
      ]),
    );
  }

  async removePeriodStart(userId: string, date: DateStr): Promise<void> {
    assertUser(userId);
    assertDate(date);
    await this.write(() =>
      this.driver.run("DELETE FROM period_start WHERE user_id = ? AND start_date = ?", [userId, date]),
    );
  }

  /* ----------------------------- daily entries ----------------------------- */

  async getDay(userId: string, date: DateStr): Promise<DayEntry | null> {
    assertUser(userId);
    assertDate(date);
    const days = await this.listDays(userId, date, date);
    return days[0] ?? null;
  }

  async listDays(userId: string, from: DateStr, to: DateStr): Promise<DayEntry[]> {
    assertUser(userId);
    assertDate(from);
    assertDate(to);
    return this.read(async () => {
      const rows = await this.driver.query<DayRow>(
        `SELECT entry_date, mood, energy, sleep_hours, sleep_quality, water_ml, flow, notes, updated_at
         FROM daily_entry WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date`,
        [userId, from, to],
      );
      const symptomRows = await this.driver.query<{ entry_date: string; symptom: string; severity: number }>(
        `SELECT entry_date, symptom, severity FROM daily_symptom
         WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date, symptom`,
        [userId, from, to],
      );
      const byDate = new Map<string, DayEntry>();
      for (const row of rows) {
        byDate.set(row.entry_date, { date: row.entry_date, ...rowToFields(row), symptoms: [], updatedAt: row.updated_at });
      }
      for (const s of symptomRows) {
        let entry = byDate.get(s.entry_date);
        if (!entry) {
          entry = { date: s.entry_date, ...EMPTY_FIELDS, symptoms: [], updatedAt: null };
          byDate.set(s.entry_date, entry);
        }
        entry.symptoms.push({ name: s.symptom as SymptomName, severity: Number(s.severity) as Severity });
      }
      return [...byDate.values()].sort((a, b) => compareDates(a.date, b.date));
    });
  }

  /**
   * Updates some fields of a day (null clears a field). Symptoms, when given,
   * replace the day's symptom list. A day with nothing left is deleted.
   * Resolves only after the write has been committed.
   */
  async saveDay(
    userId: string,
    date: DateStr,
    patch: Partial<DayFields> & { symptoms?: Symptom[] },
    today: DateStr,
  ): Promise<DayEntry | null> {
    assertUser(userId);
    assertDate(date);
    if (compareDates(date, today) > 0) throw new StorageError("You can't log entries for future days.");
    const { symptoms: symptomPatch, ...fieldPatch } = patch;
    if (symptomPatch) {
      const seen = new Set<string>();
      for (const s of symptomPatch) {
        if (!SYMPTOMS.includes(s.name)) throw new StorageError("Unknown symptom.");
        if (![1, 2, 3].includes(s.severity)) throw new StorageError("Symptom severity must be mild, moderate or severe.");
        if (seen.has(s.name)) throw new StorageError("Duplicate symptom.");
        seen.add(s.name);
      }
    }

    return this.write(async () => {
      const existing = await this.getDay(userId, date);
      const fields: DayFields = { ...EMPTY_FIELDS };
      const keys = Object.keys(EMPTY_FIELDS) as (keyof DayFields)[];
      const target = fields as unknown as Record<string, unknown>;
      for (const key of keys) {
        if (existing) target[key] = existing[key];
        const patched = (fieldPatch as Partial<DayFields>)[key];
        if (patched !== undefined) target[key] = patched;
      }
      if (typeof fields.notes === "string" && fields.notes.trim() === "") fields.notes = null;
      validateFields(fields);
      const symptoms = symptomPatch ?? existing?.symptoms ?? [];
      const now = this.nowIso();

      const statements: SqlStatement[] = [];
      if (isEmpty(fields, symptoms)) {
        statements.push(
          { sql: "DELETE FROM daily_entry WHERE user_id = ? AND entry_date = ?", params: [userId, date] },
          { sql: "DELETE FROM daily_symptom WHERE user_id = ? AND entry_date = ?", params: [userId, date] },
        );
        await this.driver.batch(statements);
        return null;
      }
      statements.push({
        sql: `INSERT OR REPLACE INTO daily_entry
              (user_id, entry_date, mood, energy, sleep_hours, sleep_quality, water_ml, flow, notes, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          userId,
          date,
          fields.mood,
          fields.energy,
          fields.sleepHours,
          fields.sleepQuality,
          fields.waterMl,
          fields.flow,
          fields.notes,
          now,
        ],
      });
      if (symptomPatch) {
        statements.push({ sql: "DELETE FROM daily_symptom WHERE user_id = ? AND entry_date = ?", params: [userId, date] });
        for (const s of symptomPatch) {
          statements.push({
            sql: "INSERT INTO daily_symptom (user_id, entry_date, symptom, severity) VALUES (?, ?, ?, ?)",
            params: [userId, date, s.name, s.severity],
          });
        }
      }
      await this.driver.batch(statements);
      return { date, ...fields, symptoms, updatedAt: now };
    });
  }

  async deleteDay(userId: string, date: DateStr): Promise<void> {
    assertUser(userId);
    assertDate(date);
    await this.write(() =>
      this.driver.batch([
        { sql: "DELETE FROM daily_entry WHERE user_id = ? AND entry_date = ?", params: [userId, date] },
        { sql: "DELETE FROM daily_symptom WHERE user_id = ? AND entry_date = ?", params: [userId, date] },
        { sql: "DELETE FROM checklist_item WHERE user_id = ? AND entry_date = ?", params: [userId, date] },
      ]),
    );
  }

  /* ----------------------------- checklist ----------------------------- */

  async getChecklist(userId: string, date: DateStr): Promise<Record<string, boolean>> {
    assertUser(userId);
    assertDate(date);
    return this.read(async () => {
      const rows = await this.driver.query<{ item_key: string; done: number }>(
        "SELECT item_key, done FROM checklist_item WHERE user_id = ? AND entry_date = ?",
        [userId, date],
      );
      return Object.fromEntries(rows.map((r) => [r.item_key, Number(r.done) === 1]));
    });
  }

  async setChecklistItem(userId: string, date: DateStr, key: string, done: boolean): Promise<void> {
    assertUser(userId);
    assertDate(date);
    if (!/^[a-z_]{1,40}$/.test(key)) throw new StorageError("Invalid checklist item.");
    await this.write(() =>
      this.driver.run(
        "INSERT OR REPLACE INTO checklist_item (user_id, entry_date, item_key, done) VALUES (?, ?, ?, ?)",
        [userId, date, key, done ? 1 : 0],
      ),
    );
  }

  /* ----------------------------- preferences ----------------------------- */

  async getPreferences(userId: string): Promise<Record<string, string>> {
    assertUser(userId);
    return this.read(async () => {
      const rows = await this.driver.query<{ pref_key: string; pref_value: string }>(
        "SELECT pref_key, pref_value FROM preference WHERE user_id = ?",
        [userId],
      );
      return Object.fromEntries(rows.map((r) => [r.pref_key, r.pref_value]));
    });
  }

  async setPreference(userId: string, key: string, value: string): Promise<void> {
    assertUser(userId);
    if (!/^[a-z_]{1,40}$/.test(key) || value.length > 200) throw new StorageError("Invalid preference.");
    await this.write(() =>
      this.driver.run("INSERT OR REPLACE INTO preference (user_id, pref_key, pref_value) VALUES (?, ?, ?)", [
        userId,
        key,
        value,
      ]),
    );
  }

  /* ----------------------------- summary & deletion ----------------------------- */

  async countRecords(userId: string): Promise<{ days: number; periodStarts: number; hasProfile: boolean }> {
    assertUser(userId);
    return this.read(async () => {
      const [days] = await this.driver.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM (
           SELECT entry_date FROM daily_entry WHERE user_id = ?
           UNION SELECT entry_date FROM daily_symptom WHERE user_id = ?)`,
        [userId, userId],
      );
      const [starts] = await this.driver.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM period_start WHERE user_id = ?",
        [userId],
      );
      const [profile] = await this.driver.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cycle_profile WHERE user_id = ?",
        [userId],
      );
      return { days: Number(days?.n ?? 0), periodStarts: Number(starts?.n ?? 0), hasProfile: Number(profile?.n ?? 0) > 0 };
    });
  }

  /** Permanently deletes every health record for one user on this device. */
  async deleteAllForUser(userId: string): Promise<void> {
    assertUser(userId);
    await this.write(() =>
      this.driver.batch(
        ["cycle_profile", "period_start", "daily_entry", "daily_symptom", "checklist_item", "preference"].map((t) => ({
          sql: `DELETE FROM ${t} WHERE user_id = ?`,
          params: [userId],
        })),
      ),
    );
  }
}
