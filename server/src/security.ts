import { createHash, randomBytes } from "node:crypto";
import * as argon2Module from "argon2";

type Argon2 = typeof argon2Module;
// Works whether the package is consumed as CommonJS (default export) or ESM (named exports).
const argon2: Argon2 = (argon2Module as unknown as { default?: Argon2 }).default ?? argon2Module;

/**
 * Argon2id parameters (OWASP-recommended baseline: m=19 MiB, t=2, p=1).
 * Tests may lower them via ARGON2_TEST_FAST to keep the suite quick.
 */
function argonOptions() {
  const fast = process.env.ARGON2_TEST_FAST === "1";
  return {
    type: argon2.argon2id,
    memoryCost: fast ? 4096 : 19_456,
    timeCost: fast ? 1 : 2,
    parallelism: 1,
  } as const;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argonOptions());
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;
/**
 * Runs a password verification against a fixed dummy hash so that login timing
 * does not reveal whether an email address is registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyHashPromise, password);
}

/** 256-bit random token, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque, non-reversible key for an email used in rate-limit records. */
export function emailKey(normalizedEmail: string): string {
  return sha256(`email:${normalizedEmail}`);
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Returns a user-facing problem with the password, or null if acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  if (/^(.)\1+$/.test(password)) return "Password is too easy to guess.";
  if (email) {
    const local = normalizeEmail(email).split("@")[0] ?? "";
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      return "Password should not contain your email address.";
    }
  }
  return null;
}
