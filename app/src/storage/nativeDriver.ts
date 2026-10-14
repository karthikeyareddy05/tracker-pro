import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { SqlDriver, SqlValue } from "./driver";

const DB_NAME = "trackerpro";

/**
 * Native Android SQLite database stored in the app's private data directory.
 * Note: this database is not encrypted by the app; it is protected by Android's
 * per-app sandbox and the device's own storage encryption.
 */
export async function createNativeDriver(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  try {
    await sqlite.checkConnectionsConsistency();
  } catch {
    // No existing connections — nothing to reconcile.
  }
  const isConnected = (await sqlite.isConnection(DB_NAME, false)).result;
  const db: SQLiteDBConnection = isConnected
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await db.open();

  return {
    kind: "native-sqlite",
    async exec(sql) {
      await db.execute(sql, true);
    },
    async run(sql, params: SqlValue[] = []) {
      await db.run(sql, params, true);
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await db.executeSet(
        statements.map((s) => ({ statement: s.sql, values: s.params ?? [] })),
        true,
      );
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      const result = await db.query(sql, params);
      return (result.values ?? []) as T[];
    },
    async close() {
      await sqlite.closeConnection(DB_NAME, false);
    },
  };
}
