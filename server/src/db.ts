import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

/** MongoDB document shapes. Only server-managed account and security data lives here. */

export interface UserDoc {
  _id: ObjectId;
  /** Normalized (trimmed, lower-cased) email. Unique. */
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  passwordChangedAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** SHA-256 of the short-lived access token. Raw tokens are never stored. */
  accessTokenHash: string;
  accessExpiresAt: Date;
  /** SHA-256 of the current refresh token (rotated on every refresh). */
  refreshTokenHash: string;
  /** SHA-256 of the refresh token that was just rotated out; used for reuse detection. */
  previousRefreshTokenHash: string | null;
  refreshExpiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

export interface PasswordResetTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface SecurityEventDoc {
  _id?: ObjectId;
  type: string;
  userId: ObjectId | null;
  createdAt: Date;
  /** Non-sensitive detail only (never passwords, tokens, emails or health data). */
  detail?: Record<string, string | number | boolean>;
}

export interface RateLimitDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

export interface Collections {
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  passwordResetTokens: Collection<PasswordResetTokenDoc>;
  securityEvents: Collection<SecurityEventDoc>;
  rateLimits: Collection<RateLimitDoc>;
}

export function getCollections(db: Db): Collections {
  return {
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    passwordResetTokens: db.collection<PasswordResetTokenDoc>("password_reset_tokens"),
    securityEvents: db.collection<SecurityEventDoc>("security_events"),
    rateLimits: db.collection<RateLimitDoc>("rate_limits"),
  };
}

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

/** Creates every index the application relies on. Safe to run repeatedly. */
export async function ensureIndexes(c: Collections): Promise<void> {
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" }),

    c.sessions.createIndex({ accessTokenHash: 1 }, { unique: true, name: "access_token_unique" }),
    c.sessions.createIndex({ refreshTokenHash: 1 }, { unique: true, name: "refresh_token_unique" }),
    c.sessions.createIndex({ previousRefreshTokenHash: 1 }, { name: "previous_refresh_token" }),
    c.sessions.createIndex({ userId: 1 }, { name: "user" }),
    // Expired sessions are removed automatically once the refresh token has expired.
    c.sessions.createIndex({ refreshExpiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_refresh_expiry" }),

    c.passwordResetTokens.createIndex({ tokenHash: 1 }, { unique: true, name: "token_unique" }),
    c.passwordResetTokens.createIndex({ userId: 1 }, { name: "user" }),
    // Keep expired/used reset records for one day for auditing, then delete them.
    c.passwordResetTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60, name: "ttl_expiry" }),

    c.securityEvents.createIndex({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_SECONDS, name: "ttl_90_days" }),
    c.securityEvents.createIndex({ userId: 1, createdAt: -1 }, { name: "user_recent" }),

    c.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_window" }),
  ]);
}

export async function connectMongo(uri: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    appName: "tracker-pro",
  });
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  return { client, db };
}
