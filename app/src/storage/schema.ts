import type { SqlDriver } from "./driver";

/**
 * Ordered, append-only schema migrations. Never edit a shipped migration;
 * add a new one with the next version number instead.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS cycle_profile (
  user_id TEXT PRIMARY KEY NOT NULL,
  cycle_length INTEGER NOT NULL CHECK (cycle_length BETWEEN 15 AND 90),
  period_length INTEGER NOT NULL CHECK (period_length BETWEEN 1 AND 15),
  last_period_start TEXT,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS period_start (
  user_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, start_date)
);
CREATE TABLE IF NOT EXISTS daily_entry (
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  mood TEXT,
  energy INTEGER CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
  sleep_hours REAL CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  sleep_quality INTEGER CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5),
  water_ml INTEGER CHECK (water_ml IS NULL OR (water_ml >= 0 AND water_ml <= 10000)),
  flow TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entry_date)
);
CREATE TABLE IF NOT EXISTS daily_symptom (
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  symptom TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  PRIMARY KEY (user_id, entry_date, symptom)
);
CREATE TABLE IF NOT EXISTS checklist_item (
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  item_key TEXT NOT NULL,
  done INTEGER NOT NULL,
  PRIMARY KEY (user_id, entry_date, item_key)
);
CREATE TABLE IF NOT EXISTS preference (
  user_id TEXT NOT NULL,
  pref_key TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  PRIMARY KEY (user_id, pref_key)
);
`,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export async function currentVersion(driver: SqlDriver): Promise<number> {
  await driver.exec(
    "CREATE TABLE IF NOT EXISTS schema_meta (meta_key TEXT PRIMARY KEY NOT NULL, meta_value TEXT NOT NULL);",
  );
  const rows = await driver.query<{ meta_value: string }>(
    "SELECT meta_value FROM schema_meta WHERE meta_key = 'version'",
  );
  return rows[0] ? Number(rows[0].meta_value) : 0;
}

/** Applies pending migrations, each in its own transaction together with its version bump. */
export async function migrate(driver: SqlDriver): Promise<number> {
  let version = await currentVersion(driver);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `On-device data was created by a newer version of Tracker Pro (schema ${version}). Please update the app.`,
    );
  }
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    await driver.exec(
      `${m.sql}\nINSERT OR REPLACE INTO schema_meta (meta_key, meta_value) VALUES ('version', '${m.version}');`,
    );
    version = m.version;
  }
  return version;
}
