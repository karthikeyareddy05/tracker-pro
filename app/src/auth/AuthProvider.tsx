import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClient, ApiError, isTestAccountsBuild, type AuthResult, type PublicUser } from "./api";
import { TestAccountsApiClient } from "./testAccountsApi";
import { createTokenStore, type CachedUser, type TokenStore } from "./tokenStore";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: CachedUser | null;
  /** Signed in from the device cache because the server couldn't be reached. */
  offline: boolean;
  /** One-off message for the login screen (e.g. "session expired"). */
  notice: string | null;
  api: ApiClient;
  login(email: string, password: string): Promise<void>;
  register(displayName: string, email: string, password: string): Promise<void>;
  /** Signs out on this device. `revoked` is false if the server couldn't be told. */
  logout(): Promise<{ revoked: boolean }>;
  /** Runs an authenticated API call, refreshing the access token when needed. */
  authedRequest<T>(fn: (accessToken: string) => Promise<T>): Promise<T>;
  setUser(user: PublicUser): void;
  /** Ends the local session after the account was deleted on the server. */
  endSession(notice?: string): Promise<void>;
  retryConnection(): Promise<void>;
  clearNotice(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface State {
  status: AuthStatus;
  user: CachedUser | null;
  offline: boolean;
  notice: string | null;
}

function toCached(user: PublicUser): CachedUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function AuthProvider({
  children,
  api: apiProp,
  tokenStore: storeProp,
}: {
  children: ReactNode;
  api?: ApiClient;
  tokenStore?: TokenStore;
}) {
  const queryClient = useQueryClient();
  const api = useMemo(
    () => apiProp ?? (isTestAccountsBuild() ? new TestAccountsApiClient() : new ApiClient()),
    [apiProp],
  );
  const store = useMemo(() => storeProp ?? createTokenStore(), [storeProp]);
  const [state, setState] = useState<State>({ status: "loading", user: null, offline: false, notice: null });

  const access = useRef<{ token: string; expiresAt: number } | null>(null);
  const refreshing = useRef<Promise<string> | null>(null);
  const userRef = useRef<CachedUser | null>(null);

  const clearLocalSession = useCallback(
    async (notice: string | null) => {
      access.current = null;
      userRef.current = null;
      try {
        await store.clear();
      } catch {
        /* nothing else we can do; state below still signs the user out */
      }
      // Remove every user-specific cached query so nothing leaks to the next account.
      queryClient.clear();
      setState({ status: "unauthenticated", user: null, offline: false, notice });
    },
    [queryClient, store],
  );

  const applySession = useCallback(
    async (result: AuthResult, opts: { newLogin: boolean }) => {
      const user = toCached(result.user);
      if (opts.newLogin || userRef.current?.id !== user.id) queryClient.clear();
      await store.setRefreshToken(result.tokens.refreshToken);
      await store.setCachedUser(user);
      access.current = { token: result.tokens.accessToken, expiresAt: Date.parse(result.tokens.accessTokenExpiresAt) };
      userRef.current = user;
      setState({ status: "authenticated", user, offline: false, notice: null });
    },
    [queryClient, store],
  );

  const refresh = useCallback((): Promise<string> => {
    refreshing.current ??= (async () => {
      try {
        const refreshToken = await store.getRefreshToken();
        if (!refreshToken) {
          await clearLocalSession("Please sign in to continue.");
          throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");
        }
        try {
          const result = await api.refresh(refreshToken);
          await applySession(result, { newLogin: false });
          return result.tokens.accessToken;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await clearLocalSession("Your session has expired. Please sign in again.");
          }
          throw error;
        }
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [api, applySession, clearLocalSession, store]);

  // Restore the session on launch — exactly once. Refresh tokens rotate, so a
  // duplicate refresh (e.g. React StrictMode re-running effects) would be
  // treated by the server as token reuse and revoke the session.
  const restoreStarted = useRef(false);
  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;
    void (async () => {
      let refreshToken: string | null = null;
      let cached: CachedUser | null = null;
      try {
        refreshToken = await store.getRefreshToken();
        cached = await store.getCachedUser();
      } catch {
        refreshToken = null;
      }
      if (!refreshToken) {
        setState({ status: "unauthenticated", user: null, offline: false, notice: null });
        return;
      }
      userRef.current = cached;
      try {
        const result = await api.refresh(refreshToken);
        await applySession(result, { newLogin: cached?.id !== result.user.id });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearLocalSession("Your session has expired. Please sign in again.");
        } else if (cached && error instanceof ApiError && (error.isNetwork || error.status >= 500 || error.status === 429)) {
          // Offline or server temporarily unavailable: keep access to on-device
          // records for the last signed-in user; reconnect later.
          setState({ status: "authenticated", user: cached, offline: true, notice: null });
        } else {
          await clearLocalSession(error instanceof ApiError ? error.message : null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryConnection = useCallback(async () => {
    try {
      await refresh();
    } catch {
      /* stays offline */
    }
  }, [refresh]);

  // Reconnect automatically when the device comes back online.
  useEffect(() => {
    if (!state.offline) return;
    const onOnline = () => void retryConnection();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [state.offline, retryConnection]);

  const authedRequest = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T> => {
      const current = access.current;
      const token = current && current.expiresAt - Date.now() > 30_000 ? current.token : await refresh();
      try {
        return await fn(token);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED") {
          return fn(await refresh());
        }
        throw error;
      }
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      api,
      async login(email, password) {
        const result = await api.login({ email, password });
        await applySession(result, { newLogin: true });
      },
      async register(displayName, email, password) {
        const result = await api.register({ displayName, email, password });
        await applySession(result, { newLogin: true });
      },
      async logout() {
        let revoked = false;
        try {
          const refreshToken = await store.getRefreshToken();
          await api.logout(access.current?.token ?? null, refreshToken);
          revoked = true;
        } catch {
          revoked = false;
        }
        await clearLocalSession(
          revoked ? null : "Signed out on this device. The server couldn't be reached, so the old session will expire on its own.",
        );
        return { revoked };
      },
      authedRequest,
      setUser(user) {
        const cached = toCached(user);
        userRef.current = cached;
        void store.setCachedUser(cached).catch(() => undefined);
        setState((s) => ({ ...s, user: cached }));
      },
      async endSession(notice) {
        await clearLocalSession(notice ?? null);
      },
      retryConnection,
      clearNotice() {
        setState((s) => ({ ...s, notice: null }));
      },
    }),
    [state, api, applySession, authedRequest, clearLocalSession, retryConnection, store],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user; only call inside routes protected by <RequireAuth>. */
export function useUser(): CachedUser {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}
