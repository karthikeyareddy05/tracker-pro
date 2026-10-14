import { Capacitor } from "@capacitor/core";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: SessionTokens;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** True when the request never reached the server (offline, DNS, TLS…). */
  get isNetwork() {
    return this.status === 0 && this.code === "NETWORK";
  }
}

/** API base URL baked in at build time. Empty means "same origin" (web deployments). */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
}

/** The Android build needs an absolute HTTPS server URL; same-origin would hit the app bundle. */
export function serverConfigProblem(): string | null {
  const base = apiBaseUrl();
  if (Capacitor.isNativePlatform()) {
    if (!base) return "This build of Tracker Pro doesn't have a server address configured, so sign-in isn't available.";
    if (!base.startsWith("https://")) return "This build's server address isn't secure (https), so sign-in is disabled.";
  }
  return null;
}

export type Fetcher = typeof fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

/**
 * Thin JSON client. Authentication headers are supplied by the caller so that
 * token refresh logic lives in one place (AuthProvider).
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? apiBaseUrl();
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
  }

  async request<T>(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown; accessToken?: string | null } = {},
  ): Promise<T> {
    const configProblem = serverConfigProblem();
    if (configProblem) throw new ApiError(0, "NOT_CONFIGURED", configProblem);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/_api${path}`, {
        method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "NETWORK", "You're offline or the server can't be reached. Please try again.");
    }

    let payload: unknown = null;
    const text = await response.text().catch(() => "");
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(
        response.status,
        err?.code ?? "HTTP_ERROR",
        err?.message ??
          (response.status >= 500
            ? "The server ran into a problem. Please try again shortly."
            : "The request couldn't be completed."),
      );
    }
    return payload as T;
  }

  register(body: { displayName: string; email: string; password: string }) {
    return this.request<AuthResult>("/auth/register_with_password", { body });
  }
  login(body: { email: string; password: string }) {
    return this.request<AuthResult>("/auth/login_with_password", { body });
  }
  refresh(refreshToken: string) {
    return this.request<AuthResult>("/auth/refresh", { body: { refreshToken } });
  }
  logout(accessToken: string | null, refreshToken: string | null) {
    return this.request<{ ok: true }>("/auth/logout", {
      accessToken,
      body: refreshToken ? { refreshToken } : {},
    });
  }
  requestPasswordReset(email: string) {
    return this.request<{ ok: true; message: string }>("/auth/request_password_reset", { body: { email } });
  }
  completePasswordReset(token: string, newPassword: string) {
    return this.request<{ ok: true; message: string }>("/auth/complete_password_reset", {
      body: { token, newPassword },
    });
  }
  getProfile(accessToken: string) {
    return this.request<{ user: PublicUser }>("/profile", { accessToken });
  }
  updateProfile(accessToken: string, displayName: string) {
    return this.request<{ user: PublicUser }>("/profile", { accessToken, body: { displayName } });
  }
  deleteAccount(accessToken: string, password: string) {
    return this.request<{ ok: true }>("/account/delete", { accessToken, body: { password } });
  }
}
