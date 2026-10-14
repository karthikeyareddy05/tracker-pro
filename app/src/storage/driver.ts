export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

/**
 * Minimal SQLite interface shared by the native Android database
 * (@capacitor-community/sqlite) and sql.js (web development fallback and tests).
 */
export interface SqlDriver {
  readonly kind: "native-sqlite" | "web-sqljs" | "memory";
  /** Executes one or more statements atomically. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Executes several parameterized statements atomically. */
  batch(statements: SqlStatement[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
