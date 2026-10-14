import { MongoServerError, ObjectId } from "mongodb";
import type { AppConfig } from "../config.js";
import type { Collections, SessionDoc, UserDoc } from "../db.js";
import { ApiError, Errors } from "../errors.js";
import { logger } from "../logger.js";
import type { Mailer } from "../mailer.js";
import { hit, peek, secondsUntil } from "../rateLimit.js";
import {
  burnPasswordCheck,
  emailKey,
  generateToken,
  hashPassword,
  normalizeEmail,
  passwordProblem,
  sha256,
  verifyPassword,
} from "../security.js";

export interface Deps {
  c: Collections;
  config: AppConfig;
  mailer: Mailer;
  now: () => Date;
}

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

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function recordEvent(
  deps: Deps,
  type: string,
  userId: ObjectId | null,
  detail?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await deps.c.securityEvents.insertOne({ type, userId, createdAt: deps.now(), ...(detail ? { detail } : {}) });
  } catch (error) {
    // Audit failures must not break authentication, but they should be visible to operators.
    logger.warn("security event write failed", { type, reason: (error as Error).name });
  }
}

/* ------------------------------------------------------------------ */
/* Rate limiting helpers                                               */
/* ------------------------------------------------------------------ */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const Limits = {
  registerPerIp: { max: 10, windowMs: HOUR },
  loginPerIp: { max: 30, windowMs: 15 * MINUTE },
  refreshPerIp: { max: 300, windowMs: 15 * MINUTE },
  resetRequestPerIp: { max: 10, windowMs: HOUR },
  resetRequestPerEmail: { max: 3, windowMs: HOUR },
  resetCompletePerIp: { max: 20, windowMs: HOUR },
  sensitivePerIp: { max: 10, windowMs: HOUR },
} as const;

export async function enforceLimit(
  deps: Deps,
  bucket: string,
  identity: string,
  limit: { max: number; windowMs: number },
): Promise<void> {
  const now = deps.now();
  const result = await hit(deps.c.rateLimits, `${bucket}:${identity}`, limit.windowMs, now);
  if (result.count > limit.max) {
    throw Errors.rateLimited(secondsUntil(result.expiresAt, now));
  }
}

const failKey = (email: string) => `login-fail:${emailKey(email)}`;
const lockKey = (email: string) => `login-lock:${emailKey(email)}`;

async function assertNotLocked(deps: Deps, email: string): Promise<void> {
  const now = deps.now();
  const lock = await peek(deps.c.rateLimits, lockKey(email), now);
  if (lock) throw Errors.locked(secondsUntil(lock.expiresAt, now));
}

async function registerFailure(deps: Deps, email: string, userId: ObjectId | null): Promise<void> {
  const now = deps.now();
  const { loginMaxFailures, loginLockoutMs } = deps.config;
  if (loginMaxFailures <= 0) return;
  const result = await hit(deps.c.rateLimits, failKey(email), loginLockoutMs, now);
  if (result.count >= loginMaxFailures) {
    const expiresAt = new Date(now.getTime() + loginLockoutMs);
    await deps.c.rateLimits.updateOne(
      { _id: lockKey(email) },
      { $set: { count: result.count, expiresAt } },
      { upsert: true },
    );
    await deps.c.rateLimits.deleteOne({ _id: failKey(email) });
    await recordEvent(deps, "login_locked", userId);
  }
}

async function clearFailures(deps: Deps, email: string): Promise<void> {
  await deps.c.rateLimits.deleteMany({ _id: { $in: [failKey(email), lockKey(email)] } });
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function createSession(deps: Deps, userId: ObjectId): Promise<SessionTokens> {
  const now = deps.now();
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const accessExpiresAt = new Date(now.getTime() + deps.config.accessTokenTtlMs);
  const refreshExpiresAt = new Date(now.getTime() + deps.config.refreshTokenTtlMs);
  const doc: SessionDoc = {
    _id: new ObjectId(),
    userId,
    accessTokenHash: sha256(accessToken),
    accessExpiresAt,
    refreshTokenHash: sha256(refreshToken),
    previousRefreshTokenHash: null,
    refreshExpiresAt,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
  };
  await deps.c.sessions.insertOne(doc);
  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export interface AuthContext {
  user: UserDoc;
  session: SessionDoc;
}

/** Resolves a bearer access token to its user and session, or null. */
export async function authenticateAccessToken(deps: Deps, accessToken: string): Promise<AuthContext | null> {
  if (!accessToken || accessToken.length > 200) return null;
  const now = deps.now();
  const session = await deps.c.sessions.findOne({
    accessTokenHash: sha256(accessToken),
    revokedAt: null,
    accessExpiresAt: { $gt: now },
  });
  if (!session) return null;
  const user = await deps.c.users.findOne({ _id: session.userId });
  if (!user) return null;
  return { user, session };
}

/**
 * Exchanges a refresh token for a new token pair (rotation). Presenting a
 * refresh token that was already rotated out revokes the whole session,
 * because it indicates the token may have been copied.
 */
export async function refreshSession(deps: Deps, refreshToken: string): Promise<AuthResult> {
  if (!refreshToken || refreshToken.length > 200) throw Errors.unauthenticated();
  const now = deps.now();
  const presentedHash = sha256(refreshToken);
  const accessToken = generateToken();
  const nextRefresh = generateToken();
  const accessExpiresAt = new Date(now.getTime() + deps.config.accessTokenTtlMs);
  const refreshExpiresAt = new Date(now.getTime() + deps.config.refreshTokenTtlMs);

  const rotated = await deps.c.sessions.findOneAndUpdate(
    { refreshTokenHash: presentedHash, revokedAt: null, refreshExpiresAt: { $gt: now } },
    {
      $set: {
        accessTokenHash: sha256(accessToken),
        accessExpiresAt,
        refreshTokenHash: sha256(nextRefresh),
        previousRefreshTokenHash: presentedHash,
        refreshExpiresAt,
        lastUsedAt: now,
      },
    },
    { returnDocument: "after" },
  );

  if (!rotated) {
    const reused = await deps.c.sessions.findOneAndUpdate(
      { previousRefreshTokenHash: presentedHash, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    if (reused) await recordEvent(deps, "refresh_token_reuse_detected", reused.userId);
    throw Errors.unauthenticated();
  }

  const user = await deps.c.users.findOne({ _id: rotated.userId });
  if (!user) {
    await deps.c.sessions.updateOne({ _id: rotated._id }, { $set: { revokedAt: now } });
    throw Errors.unauthenticated();
  }
  return {
    user: toPublicUser(user),
    tokens: {
      accessToken,
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshToken: nextRefresh,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    },
  };
}

export async function revokeSession(deps: Deps, sessionId: ObjectId): Promise<void> {
  await deps.c.sessions.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: deps.now() } });
}

/** Revokes the session that owns the given refresh token, if any. */
export async function revokeByRefreshToken(deps: Deps, refreshToken: string): Promise<ObjectId | null> {
  const doc = await deps.c.sessions.findOneAndUpdate(
    { refreshTokenHash: sha256(refreshToken), revokedAt: null },
    { $set: { revokedAt: deps.now() } },
  );
  return doc?.userId ?? null;
}

/* ------------------------------------------------------------------ */
/* Registration and login                                              */
/* ------------------------------------------------------------------ */

export async function register(
  deps: Deps,
  input: { displayName: string; email: string; password: string },
): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const problem = passwordProblem(input.password, email);
  if (problem) throw Errors.validation(problem);

  const now = deps.now();
  const passwordHash = await hashPassword(input.password);
  const user: UserDoc = {
    _id: new ObjectId(),
    email,
    displayName: input.displayName.trim(),
    passwordHash,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  };
  try {
    await deps.c.users.insertOne(user);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new ApiError(
        409,
        "ACCOUNT_EXISTS",
        "We couldn't create an account with these details. If you already have an account, sign in or reset your password.",
      );
    }
    throw error;
  }
  await recordEvent(deps, "account_registered", user._id);
  const tokens = await createSession(deps, user._id);
  return { user: toPublicUser(user), tokens };
}

export async function login(deps: Deps, input: { email: string; password: string }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  await assertNotLocked(deps, email);

  const user = await deps.c.users.findOne({ email });
  if (!user) {
    await burnPasswordCheck(input.password);
    await registerFailure(deps, email, null);
    throw Errors.invalidCredentials();
  }
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await registerFailure(deps, email, user._id);
    await recordEvent(deps, "login_failed", user._id);
    throw Errors.invalidCredentials();
  }
  await clearFailures(deps, email);
  await recordEvent(deps, "login_succeeded", user._id);
  const tokens = await createSession(deps, user._id);
  return { user: toPublicUser(user), tokens };
}

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

export const RESET_REQUEST_MESSAGE =
  "If an account exists for this email, you will receive password-reset instructions.";

export async function requestPasswordReset(deps: Deps, rawEmail: string): Promise<void> {
  if (!deps.mailer.configured) {
    throw Errors.serviceUnavailable(
      "Password reset by email isn't available yet because email delivery hasn't been configured on the server.",
    );
  }
  const email = normalizeEmail(rawEmail);
  const now = deps.now();

  // Per-address limit: silently stop sending (same response) to avoid mailbox flooding and enumeration.
  const perEmail = await hit(
    deps.c.rateLimits,
    `reset-email:${emailKey(email)}`,
    Limits.resetRequestPerEmail.windowMs,
    now,
  );
  if (perEmail.count > Limits.resetRequestPerEmail.max) return;

  const user = await deps.c.users.findOne({ email });
  if (!user) return;

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + deps.config.resetTokenTtlMs);
  // Only one usable reset token per account: drop any earlier unused ones.
  await deps.c.passwordResetTokens.deleteMany({ userId: user._id, usedAt: null });
  await deps.c.passwordResetTokens.insertOne({
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt,
    usedAt: null,
    createdAt: now,
  });

  // The token travels in the URL fragment, which browsers never send to servers or proxies.
  const resetUrl = `${deps.config.appBaseUrl}/reset-password#token=${encodeURIComponent(token)}`;
  try {
    await deps.mailer.sendPasswordReset({
      to: user.email,
      displayName: user.displayName,
      resetUrl,
      expiresInMinutes: Math.round(deps.config.resetTokenTtlMs / MINUTE),
    });
    await recordEvent(deps, "password_reset_requested", user._id);
  } catch (error) {
    // The token cannot be delivered, so it must not remain usable.
    await deps.c.passwordResetTokens.deleteOne({ tokenHash: sha256(token) });
    await recordEvent(deps, "password_reset_email_failed", user._id);
    logger.error("password reset email failed", { reason: (error as Error).message });
  }
}

export async function completePasswordReset(deps: Deps, token: string, newPassword: string): Promise<void> {
  if (!token || token.length > 200) {
    throw new ApiError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Please request a new one.");
  }
  const now = deps.now();
  const tokenHash = sha256(token);

  // Validate the password before consuming the token so a typo doesn't burn the link.
  const pending = await deps.c.passwordResetTokens.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: now } });
  if (!pending) {
    throw new ApiError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Please request a new one.");
  }
  const user = await deps.c.users.findOne({ _id: pending.userId });
  if (!user) {
    throw new ApiError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Please request a new one.");
  }
  const problem = passwordProblem(newPassword, user.email);
  if (problem) throw Errors.validation(problem);
  const passwordHash = await hashPassword(newPassword);

  // Atomic single-use claim: only one request can flip usedAt from null.
  const claimed = await deps.c.passwordResetTokens.findOneAndUpdate(
    { _id: pending._id, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (!claimed) {
    throw new ApiError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Please request a new one.");
  }

  await deps.c.users.updateOne(
    { _id: user._id },
    { $set: { passwordHash, passwordChangedAt: now, updatedAt: now } },
  );
  // Sign out every device: anyone holding an old session loses access.
  await deps.c.sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: now } });
  await deps.c.passwordResetTokens.deleteMany({ userId: user._id, usedAt: null });
  await clearFailures(deps, user.email);
  await recordEvent(deps, "password_reset_completed", user._id);
}

/* ------------------------------------------------------------------ */
/* Profile and account deletion                                        */
/* ------------------------------------------------------------------ */

export async function updateDisplayName(deps: Deps, userId: ObjectId, displayName: string): Promise<PublicUser> {
  const updated = await deps.c.users.findOneAndUpdate(
    { _id: userId },
    { $set: { displayName: displayName.trim(), updatedAt: deps.now() } },
    { returnDocument: "after" },
  );
  if (!updated) throw Errors.unauthenticated();
  return toPublicUser(updated);
}

export async function deleteAccount(deps: Deps, user: UserDoc, password: string): Promise<void> {
  await assertNotLocked(deps, user.email);
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await registerFailure(deps, user.email, user._id);
    throw new ApiError(401, "INVALID_PASSWORD", "That password isn't correct.");
  }
  await deps.c.sessions.deleteMany({ userId: user._id });
  await deps.c.passwordResetTokens.deleteMany({ userId: user._id });
  await deps.c.securityEvents.deleteMany({ userId: user._id });
  await deps.c.users.deleteOne({ _id: user._id });
  await clearFailures(deps, user.email);
  // Anonymous record that a deletion happened (no identifiers retained).
  await recordEvent(deps, "account_deleted", null);
}
