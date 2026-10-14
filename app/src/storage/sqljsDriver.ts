import type { Database, SqlJsStatic } from "sql.js";
import type { SqlDriver, SqlStatement, SqlValue } from "./driver";

export interface SqlJsDriverOptions {
  kind?: "web-sqljs" | "memory";
  initialBytes?: Uint8Array | null;
  /** Called with the full database image after every successful write. */
  persist?: (bytes: Uint8Array) => void | Promise<void>;
}

/** SQLite compiled to WebAssembly. Used for browser development and automated tests. */
export function createSqlJsDriver(SQL: SqlJsStatic, options: SqlJsDriverOptions = {}): SqlDriver & { export(): Uint8Array } {
  const db: Database = options.initialBytes ? new SQL.Database(options.initialBytes) : new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON;");

  const persist = async () => {
    if (options.persist) await options.persist(db.export());
  };

  const inTransaction = async (work: () => void) => {
    db.exec("BEGIN");
    try {
      work();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    await persist();
  };

  return {
    kind: options.kind ?? "memory",
    async exec(sql) {
      await inTransaction(() => db.exec(sql));
    },
    async run(sql, params: SqlValue[] = []) {
      await inTransaction(() => db.run(sql, params));
    },
    async batch(statements: SqlStatement[]) {
      await inTransaction(() => {
        for (const s of statements) db.run(s.sql, s.params ?? []);
      });
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
    async close() {
      db.close();
    },
    export() {
      return db.export();
    },
  };
}
