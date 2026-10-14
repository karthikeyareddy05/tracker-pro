import { Capacitor } from "@capacitor/core";

/**
 * Persists the refresh token and a minimal copy of the signed-in user.
 * - Android: Android Keystore-backed secure storage.
 * - Web (development): sessionStorage, cleared when the tab closes.
 * Access tokens are short-lived and kept in memory only.
 */
export interface CachedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface TokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  getCachedUser(): Promise<CachedUser | null>;
  setCachedUser(user: CachedUser): Promise<void>;
  clear(): Promise<void>;
}

const REFRESH_KEY = "tp.refreshToken";
const USER_KEY = "tp.user";

function parseUser(raw: unknown): CachedUser | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value && typeof value.id === "string" && typeof value.email === "string") {
      return { id: value.id, email: value.email, displayName: String(value.displayName ?? "") };
    }
  } catch {
    /* corrupt entry */
  }
  return null;
}

function webStore(): TokenStore {
  const s = () => window.sessionStorage;
  return {
    async getRefreshToken() {
      return s().getItem(REFRESH_KEY);
    },
    async setRefreshToken(token) {
      s().setItem(REFRESH_KEY, token);
    },
    async getCachedUser() {
      return parseUser(s().getItem(USER_KEY));
    },
    async setCachedUser(user) {
      s().setItem(USER_KEY, JSON.stringify(user));
    },
    async clear() {
      s().removeItem(REFRESH_KEY);
      s().removeItem(USER_KEY);
    },
  };
}

function nativeStore(): TokenStore {
  const plugin = () => import("@aparajita/capacitor-secure-storage").then((m) => m.SecureStorage);
  const getString = async (key: string): Promise<string | null> => {
    const value = await (await plugin()).get(key);
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  return {
    getRefreshToken: () => getString(REFRESH_KEY),
    async setRefreshToken(token) {
      await (await plugin()).set(REFRESH_KEY, token);
    },
    async getCachedUser() {
      return parseUser(await getString(USER_KEY));
    },
    async setCachedUser(user) {
      await (await plugin()).set(USER_KEY, JSON.stringify(user));
    },
    async clear() {
      const s = await plugin();
      await s.remove(REFRESH_KEY);
      await s.remove(USER_KEY);
    },
  };
}

export function createTokenStore(): TokenStore {
  return Capacitor.isNativePlatform() ? nativeStore() : webStore();
}
