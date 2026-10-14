import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { SqlDriver } from "./driver";
import { createSqlJsDriver } from "./sqljsDriver";

const KEY = "tp.webdb.v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Development-only fallback for running Tracker Pro in a desktop browser.
 * The SQLite image is kept in this browser's localStorage, unencrypted.
 * It is NOT equivalent to the Android app's on-device database.
 */
export async function createWebDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = localStorage.getItem(KEY);
  return createSqlJsDriver(SQL, {
    kind: "web-sqljs",
    initialBytes: saved ? fromBase64(saved) : null,
    persist: (bytes) => {
      // Throws (e.g. quota exceeded) so the caller reports the failed save.
      localStorage.setItem(KEY, toBase64(bytes));
    },
  });
}

export function clearWebDatabase(): void {
  localStorage.removeItem(KEY);
}
