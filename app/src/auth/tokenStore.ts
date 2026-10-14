import { SecureStorage } from "@aparajita/capacitor-secure-storage";
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

/**
 * Rejects if a native call doesn't answer in time, so a stalled plugin can
 * never leave the app stuck on the launch screen.
 */
function withTimeout<T>(work: Promise<T>, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Secure storage did not respond")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function nativeStore(): TokenStore {
  // Note: a Capacitor plugin object must never be returned from a promise or
  // async function. Promise resolution probes it for `.then`, which the plugin
  // proxy treats as an unimplemented native method, and the promise never settles.
  const getString = async (key: string): Promise<string | null> => {
    const value = await withTimeout(SecureStorage.get(key));
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  return {
    getRefreshToken: () => getString(REFRESH_KEY),
    async setRefreshToken(token) {
      await withTimeout(SecureStorage.set(REFRESH_KEY, token));
    },
    async getCachedUser() {
      return parseUser(await getString(USER_KEY));
    },
    async setCachedUser(user) {
      await withTimeout(SecureStorage.set(USER_KEY, JSON.stringify(user)));
    },
    async clear() {
      await withTimeout(SecureStorage.remove(REFRESH_KEY));
      await withTimeout(SecureStorage.remove(USER_KEY));
    },
  };
}

export function createTokenStore(): TokenStore {
  return Capacitor.isNativePlatform() ? nativeStore() : webStore();
}
