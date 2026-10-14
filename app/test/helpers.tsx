import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { render } from "@testing-library/react";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "../src/App";
import { ApiClient } from "../src/auth/api";
import type { CachedUser, TokenStore } from "../src/auth/tokenStore";
import type { SqlDriver } from "../src/storage/driver";
import { HealthStore } from "../src/storage/healthStore";
import { createSqlJsDriver } from "../src/storage/sqljsDriver";

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Loads sql.js with its wasm binary read from disk (no network/fetch in tests). */
export function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const require = createRequire(import.meta.url);
    const bytes = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
    const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    sqlPromise = initSqlJs({ wasmBinary });
  }
  return sqlPromise;
}

export async function memoryDriver(initialBytes?: Uint8Array) {
  return createSqlJsDriver(await loadSql(), { kind: "memory", initialBytes });
}

/** Wraps a driver so writes can be made to fail on demand. */
export function failingDriver(inner: SqlDriver) {
  const control = { failWrites: false };
  const fail = () => Promise.reject(new Error("disk I/O error"));
  const driver: SqlDriver = {
    kind: inner.kind,
    exec: (sql) => (control.failWrites ? fail() : inner.exec(sql)),
    run: (sql, p) => (control.failWrites ? fail() : inner.run(sql, p)),
    batch: (s) => (control.failWrites ? fail() : inner.batch(s)),
    query: (sql, p) => inner.query(sql, p),
    close: () => inner.close(),
  };
  return { driver, control };
}

export class MemoryTokenStore implements TokenStore {
  refreshToken: string | null = null;
  user: CachedUser | null = null;
  async getRefreshToken() {
    return this.refreshToken;
  }
  async setRefreshToken(token: string) {
    this.refreshToken = token;
  }
  async getCachedUser() {
    return this.user;
  }
  async setCachedUser(user: CachedUser) {
    this.user = user;
  }
  async clear() {
    this.refreshToken = null;
    this.user = null;
  }
}

interface FakeUser {
  id: string;
  email: string;
  displayName: string;
  password: string;
}

/**
 * In-memory stand-in for the Tracker Pro API, used only by UI flow tests.
 * The real server, including all security behaviour, is tested in server/test.
 */
export class FakeServer {
  users = new Map<string, FakeUser>();
  access = new Map<string, string>();
  refresh = new Map<string, string>();
  resetTokens = new Map<string, string>();
  offline = false;
  calls: string[] = [];
  private n = 0;

  private token(prefix: string) {
    this.n += 1;
    return `${prefix}-${this.n}-${Math.random().toString(36).slice(2)}`;
  }

  addUser(email: string, password: string, displayName: string): FakeUser {
    const user = { id: `user-${this.users.size + 1}`, email, password, displayName };
    this.users.set(email, user);
    return user;
  }

  /** Creates a session for a user, as if they'd signed in earlier. */
  issueRefresh(user: FakeUser) {
    const rt = this.token("rt");
    this.refresh.set(rt, user.id);
    return rt;
  }

  private findById(id: string) {
    return [...this.users.values()].find((u) => u.id === id) ?? null;
  }

  private session(user: FakeUser) {
    const accessToken = this.token("at");
    const refreshToken = this.token("rt");
    this.access.set(accessToken, user.id);
    this.refresh.set(refreshToken, user.id);
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: "2026-01-01T00:00:00.000Z" },
      tokens: {
        accessToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        refreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    };
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/_api/, "");
    this.calls.push(path);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const auth = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? null;
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    const error = (status: number, code: string, message: string) => json(status, { error: { code, message } });
    const authedUser = () => (auth && this.access.has(auth) ? this.findById(this.access.get(auth)!) : null);

    switch (path) {
      case "/auth/register_with_password": {
        const email = String(body.email).toLowerCase();
        if (this.users.has(email)) return error(409, "ACCOUNT_EXISTS", "An account already exists.");
        return json(201, this.session(this.addUser(email, body.password, body.displayName)));
      }
      case "/auth/login_with_password": {
        const user = this.users.get(String(body.email).toLowerCase());
        if (!user || user.password !== body.password) return error(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
        return json(200, this.session(user));
      }
      case "/auth/refresh": {
        const userId = this.refresh.get(body.refreshToken);
        if (!userId) return error(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again.");
        this.refresh.delete(body.refreshToken);
        const user = this.findById(userId);
        if (!user) return error(401, "UNAUTHENTICATED", "Your session has expired.");
        return json(200, this.session(user));
      }
      case "/auth/logout": {
        if (auth) this.access.delete(auth);
        if (body.refreshToken) this.refresh.delete(body.refreshToken);
        return json(200, { ok: true });
      }
      case "/auth/request_password_reset": {
        const user = this.users.get(String(body.email).toLowerCase());
        if (user) this.resetTokens.set(this.token("reset"), user.id);
        return json(200, { ok: true, message: "If an account exists for this email, you will receive password-reset instructions." });
      }
      case "/auth/complete_password_reset": {
        const userId = this.resetTokens.get(body.token);
        if (!userId) return error(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Please request a new one.");
        this.resetTokens.delete(body.token);
        const user = this.findById(userId)!;
        user.password = body.newPassword;
        return json(200, { ok: true, message: "Your password has been updated. Please sign in with your new password." });
      }
      case "/profile": {
        const user = authedUser();
        if (!user) return error(401, "UNAUTHENTICATED", "Your session has expired.");
        if (init?.method === "POST") user.displayName = body.displayName;
        return json(200, { user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: "2026-01-01T00:00:00.000Z" } });
      }
      default:
        return error(404, "NOT_FOUND", "Not found.");
    }
  };
}

export interface RenderOptions {
  path: string;
  server: FakeServer;
  tokenStore: MemoryTokenStore;
  driver: SqlDriver;
  openStore?: () => Promise<HealthStore>;
}

export function renderApp({ path, server, tokenStore, driver, openStore }: RenderOptions) {
  const api = new ApiClient({ baseUrl: "http://api.test", fetcher: server.fetch as typeof fetch });
  const open = openStore ?? (() => HealthStore.open(driver));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders deps={{ api, tokenStore }}>
        <AppRoutes openStore={open} />
      </AppProviders>
    </MemoryRouter>,
  );
}
