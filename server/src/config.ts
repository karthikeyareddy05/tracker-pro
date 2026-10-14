/**
 * Server configuration, read from environment variables only.
 * No secret has a default value; nothing here is ever sent to clients.
 */
export interface AppConfig {
  mongodbUri: string;
  mongodbDbName: string;
  /** Public base URL of this deployment, used to build password-reset links. */
  appBaseUrl: string;
  resendApiKey: string | null;
  resendFromEmail: string | null;
  /** Extra browser origins allowed by CORS (comma-separated in env). */
  corsOrigins: string[];
  port: number;
  /** Number of reverse proxies in front of the app (Render/Railway = 1). */
  trustProxy: number;
  isProduction: boolean;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  resetTokenTtlMs: number;
  loginMaxFailures: number;
  loginLockoutMs: number;
  /** Directory containing the built web app to serve (optional). */
  webDistDir: string | null;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer.`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name]?.trim();
  return raw ? raw : null;
}

/** Origins used by the Capacitor Android WebView and local development. */
export const DEFAULT_APP_ORIGINS = [
  "https://localhost", // Capacitor Android (androidScheme: "https")
  "capacitor://localhost", // Capacitor iOS
  "http://localhost", // Capacitor Android with androidScheme "http"
  "http://localhost:5173", // Vite dev server
  "http://127.0.0.1:5173",
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongodbUri = optional(env, "MONGODB_URI");
  if (!mongodbUri) {
    throw new Error(
      "MONGODB_URI is not set. Configure it in your hosting provider's environment settings (see .env.example).",
    );
  }
  const isProduction = env.NODE_ENV === "production";
  const appBaseUrl = (optional(env, "APP_BASE_URL") ?? `http://localhost:${env.PORT ?? "8787"}`).replace(/\/+$/, "");
  if (isProduction && !appBaseUrl.startsWith("https://")) {
    throw new Error("APP_BASE_URL must be an https:// URL in production.");
  }

  const extraOrigins = (optional(env, "CORS_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  let baseOrigin: string[] = [];
  try {
    baseOrigin = [new URL(appBaseUrl).origin];
  } catch {
    throw new Error("APP_BASE_URL is not a valid URL.");
  }

  return {
    mongodbUri,
    mongodbDbName: optional(env, "MONGODB_DB_NAME") ?? "tracker_pro",
    appBaseUrl,
    resendApiKey: optional(env, "RESEND_API_KEY"),
    resendFromEmail: optional(env, "RESEND_FROM_EMAIL"),
    corsOrigins: Array.from(new Set([...DEFAULT_APP_ORIGINS, ...baseOrigin, ...extraOrigins])),
    port: intFromEnv(env, "PORT", 8787),
    trustProxy: intFromEnv(env, "TRUST_PROXY", isProduction ? 1 : 0),
    isProduction,
    accessTokenTtlMs: intFromEnv(env, "ACCESS_TOKEN_TTL_MINUTES", 15) * MINUTE,
    refreshTokenTtlMs: intFromEnv(env, "REFRESH_TOKEN_TTL_DAYS", 30) * DAY,
    resetTokenTtlMs: intFromEnv(env, "RESET_TOKEN_TTL_MINUTES", 30) * MINUTE,
    loginMaxFailures: intFromEnv(env, "LOGIN_MAX_FAILURES", 3),
    loginLockoutMs: intFromEnv(env, "LOGIN_LOCKOUT_MINUTES", 15) * MINUTE,
    webDistDir: optional(env, "WEB_DIST_DIR"),
  };
}
