import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import type { ObjectId } from "mongodb";
import { z, ZodError } from "zod";
import type { AppConfig } from "./config.js";
import type { Collections } from "./db.js";
import { ApiError, Errors } from "./errors.js";
import { logger } from "./logger.js";
import type { Mailer } from "./mailer.js";
import { PASSWORD_MAX_LENGTH } from "./security.js";
import {
  authenticateAccessToken,
  completePasswordReset,
  deleteAccount,
  enforceLimit,
  Limits,
  login,
  RESET_REQUEST_MESSAGE,
  recordEvent,
  refreshSession,
  register,
  requestPasswordReset,
  revokeByRefreshToken,
  revokeSession,
  toPublicUser,
  updateDisplayName,
  type AuthContext,
  type Deps,
} from "./services/auth.js";

export interface CreateAppOptions {
  collections: Collections;
  config: AppConfig;
  mailer: Mailer;
  now?: () => Date;
  /** Optional readiness probe, e.g. a MongoDB ping. */
  healthCheck?: () => Promise<void>;
}

/* ---------------------------- validation ---------------------------- */

const email = z
  .string({ required_error: "Email is required." })
  .trim()
  .min(3, "Enter a valid email address.")
  .max(254, "Enter a valid email address.")
  .email("Enter a valid email address.");
const password = z
  .string({ required_error: "Password is required." })
  .min(1, "Password is required.")
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
const displayName = z
  .string({ required_error: "Name is required." })
  .trim()
  .min(1, "Name is required.")
  .max(80, "Name must be at most 80 characters.")
  .refine((v) => !/[<>]/.test(v), "Name contains characters that aren't allowed.");
const opaqueToken = z.string().min(10).max(200);

const schemas = {
  register: z.object({ displayName, email, password }).strict(),
  login: z.object({ email, password }).strict(),
  refresh: z.object({ refreshToken: opaqueToken }).strict(),
  logout: z.object({ refreshToken: opaqueToken.optional() }).strict(),
  requestReset: z.object({ email }).strict(),
  completeReset: z.object({ token: z.string().max(200), newPassword: password }).strict(),
  profileUpdate: z.object({ displayName }).strict(),
  deleteAccount: z.object({ password }).strict(),
};

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body ?? {});
}

/* ---------------------------- helpers ---------------------------- */

type AuthedRequest = Request & { auth?: AuthContext };

const asyncHandler =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req as AuthedRequest, res).catch(next);
  };

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function bearerToken(req: Request): string | null {
  const header = req.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{10,200})$/.exec(header.trim());
  return match?.[1] ?? null;
}

/* ---------------------------- app ---------------------------- */

export function createApp(options: CreateAppOptions) {
  const { config } = options;
  const deps: Deps = {
    c: options.collections,
    config,
    mailer: options.mailer,
    now: options.now ?? (() => new Date()),
  };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'", "'wasm-unsafe-eval'"],
          "connect-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "font-src": ["'self'", "data:"],
          // Only force https in production; local http (dev/e2e) must keep working.
          "upgrade-insecure-requests": config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isProduction ? undefined : false,
    }),
  );

  // Request log: method, route and status only. Never bodies, headers, query strings or tokens.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/_api/")) {
        logger.info("request", {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        });
      }
    });
    next();
  });

  // CORS for the Capacitor app and development origins. Tokens travel in the
  // Authorization header (no cookies), so credentials are never enabled and
  // cross-site request forgery does not apply.
  const allowedOrigins = new Set(config.corsOrigins);
  app.use("/_api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(origin && allowedOrigins.has(origin) ? 204 : 403).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/_api", express.json({ limit: "10kb", strict: true, type: ["application/json"] }));

  const requireAuth: RequestHandler = (req, _res, next) => {
    const token = bearerToken(req);
    if (!token) {
      next(Errors.unauthenticated());
      return;
    }
    authenticateAccessToken(deps, token)
      .then((ctx) => {
        if (!ctx) throw Errors.unauthenticated();
        (req as AuthedRequest).auth = ctx;
        next();
      })
      .catch(next);
  };

  const api = express.Router();

  api.get(
    "/health",
    asyncHandler(async (_req, res) => {
      try {
        await options.healthCheck?.();
        res.json({ status: "ok", database: options.healthCheck ? "reachable" : "unchecked", email: deps.mailer.configured ? "configured" : "not_configured" });
      } catch {
        res.status(503).json({ status: "degraded", database: "unreachable" });
      }
    }),
  );

  api.post(
    "/auth/register_with_password",
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "register-ip", clientIp(req), Limits.registerPerIp);
      const body = parse(schemas.register, req.body);
      const result = await register(deps, body);
      res.status(201).json(result);
    }),
  );

  api.post(
    "/auth/login_with_password",
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "login-ip", clientIp(req), Limits.loginPerIp);
      const body = parse(schemas.login, req.body);
      const result = await login(deps, body);
      res.json(result);
    }),
  );

  api.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "refresh-ip", clientIp(req), Limits.refreshPerIp);
      const body = parse(schemas.refresh, req.body);
      res.json(await refreshSession(deps, body.refreshToken));
    }),
  );

  api.get(
    "/auth/session",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ user: toPublicUser(req.auth!.user) });
    }),
  );

  api.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const body = parse(schemas.logout, req.body);
      const token = bearerToken(req);
      let userId: ObjectId | null = null;
      if (token) {
        const ctx = await authenticateAccessToken(deps, token);
        if (ctx) {
          await revokeSession(deps, ctx.session._id);
          userId = ctx.user._id;
        }
      }
      if (body.refreshToken) {
        userId = (await revokeByRefreshToken(deps, body.refreshToken)) ?? userId;
      }
      if (userId) await recordEvent(deps, "logout", userId);
      // Idempotent: logging out an already-invalid session still succeeds.
      res.json({ ok: true });
    }),
  );

  api.post(
    "/auth/request_password_reset",
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "reset-ip", clientIp(req), Limits.resetRequestPerIp);
      const body = parse(schemas.requestReset, req.body);
      await requestPasswordReset(deps, body.email);
      res.json({ ok: true, message: RESET_REQUEST_MESSAGE });
    }),
  );

  api.post(
    "/auth/complete_password_reset",
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "reset-complete-ip", clientIp(req), Limits.resetCompletePerIp);
      const body = parse(schemas.completeReset, req.body);
      await completePasswordReset(deps, body.token, body.newPassword);
      res.json({ ok: true, message: "Your password has been updated. Please sign in with your new password." });
    }),
  );

  api.get(
    "/profile",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ user: toPublicUser(req.auth!.user) });
    }),
  );

  api.post(
    "/profile",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = parse(schemas.profileUpdate, req.body);
      res.json({ user: await updateDisplayName(deps, req.auth!.user._id, body.displayName) });
    }),
  );

  api.post(
    "/account/delete",
    requireAuth,
    asyncHandler(async (req, res) => {
      await enforceLimit(deps, "sensitive-ip", clientIp(req), Limits.sensitivePerIp);
      const body = parse(schemas.deleteAccount, req.body);
      await deleteAccount(deps, req.auth!.user, body.password);
      res.json({ ok: true });
    }),
  );

  api.use((_req, _res, next) => next(Errors.notFound()));
  app.use("/_api", api);

  // Optional: serve the built web app (used for password-reset links opened in a browser).
  if (config.webDistDir && existsSync(path.join(config.webDistDir, "index.html"))) {
    const dist = path.resolve(config.webDistDir);
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/_api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  // Error handler: consistent JSON shape, no stack traces or internals.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "Invalid request.";
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
      return;
    }
    if (err instanceof ApiError) {
      if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const anyErr = err as { type?: string; status?: number } | undefined;
    if (anyErr?.type === "entity.parse.failed" || anyErr?.type === "entity.too.large") {
      res.status(anyErr.status ?? 400).json({ error: { code: "BAD_REQUEST", message: "Invalid request body." } });
      return;
    }
    logger.error("unhandled error", { name: (err as Error)?.name ?? "unknown" });
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  });

  return app;
}
