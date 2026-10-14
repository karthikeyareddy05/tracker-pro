import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/security.js";
import { startHarness, VALID_PASSWORD, type Harness } from "./helpers.js";

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(async () => {
  await h.reset();
});

async function registerUser(email = "Asha@Example.com", password = VALID_PASSWORD) {
  return request(h.app)
    .post("/_api/auth/register_with_password")
    .send({ displayName: "Asha", email, password });
}

describe("registration", () => {
  it("creates an account, hashes the password and returns a session", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "asha@example.com", displayName: "Asha" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));

    const stored = await h.c.users.findOne({ email: "asha@example.com" });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toContain(VALID_PASSWORD);
    expect(stored!.passwordHash.startsWith("$argon2id$")).toBe(true);

    // Only token hashes are persisted.
    const session = await h.c.sessions.findOne({ userId: stored!._id });
    expect(session!.accessTokenHash).toBe(sha256(res.body.tokens.accessToken));
    expect(JSON.stringify(session)).not.toContain(res.body.tokens.accessToken);
  });

  it("rejects duplicate emails regardless of case and whitespace", async () => {
    await registerUser("asha@example.com");
    const dup = await registerUser("  ASHA@example.COM ");
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ACCOUNT_EXISTS");
    expect(await h.c.users.countDocuments()).toBe(1);
  });

  it("validates email format and password policy", async () => {
    const badEmail = await registerUser("not-an-email");
    expect(badEmail.status).toBe(400);
    const weak = await registerUser("weak@example.com", "password");
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");
    expect(await h.c.users.countDocuments()).toBe(0);
  });

  it("rejects unexpected fields", async () => {
    const res = await request(h.app)
      .post("/_api/auth/register_with_password")
      .send({ displayName: "A", email: "a@example.com", password: VALID_PASSWORD, isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe("login and sessions", () => {
  it("logs in with valid credentials and validates the session", async () => {
    await registerUser();
    const res = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "asha@example.com", password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    const session = await request(h.app)
      .get("/_api/auth/session")
      .set("Authorization", `Bearer ${res.body.tokens.accessToken}`);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe("asha@example.com");
  });

  it("rejects a wrong password with a generic message", async () => {
    await registerUser();
    const wrong = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "asha@example.com", password: "Wrong12345" });
    const unknown = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "nobody@example.com", password: "Wrong12345" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("rejects missing, malformed and expired access tokens", async () => {
    const reg = await registerUser();
    expect((await request(h.app).get("/_api/auth/session")).status).toBe(401);
    expect((await request(h.app).get("/_api/auth/session").set("Authorization", "Bearer nope")).status).toBe(401);
    h.clock.advance(16 * 60_000);
    const expired = await request(h.app)
      .get("/_api/auth/session")
      .set("Authorization", `Bearer ${reg.body.tokens.accessToken}`);
    expect(expired.status).toBe(401);
  });

  it("rotates refresh tokens and revokes the session when an old one is reused", async () => {
    const reg = await registerUser();
    const first = reg.body.tokens.refreshToken;
    const refreshed = await request(h.app).post("/_api/auth/refresh").send({ refreshToken: first });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.tokens.refreshToken).not.toBe(first);

    const reuse = await request(h.app).post("/_api/auth/refresh").send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    // The legitimate holder of the new token is signed out too.
    const after = await request(h.app)
      .post("/_api/auth/refresh")
      .send({ refreshToken: refreshed.body.tokens.refreshToken });
    expect(after.status).toBe(401);
    expect(await h.c.securityEvents.countDocuments({ type: "refresh_token_reuse_detected" })).toBe(1);
  });

  it("logout invalidates both access and refresh tokens", async () => {
    const reg = await registerUser();
    const { accessToken, refreshToken } = reg.body.tokens;
    const out = await request(h.app)
      .post("/_api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(out.status).toBe(200);
    expect((await request(h.app).get("/_api/auth/session").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
    expect((await request(h.app).post("/_api/auth/refresh").send({ refreshToken })).status).toBe(401);
  });

  it("does not trust a client-supplied user id", async () => {
    const a = await registerUser("a@example.com");
    const b = await registerUser("b@example.com");
    const res = await request(h.app)
      .get("/_api/profile")
      .set("Authorization", `Bearer ${a.body.tokens.accessToken}`)
      .query({ userId: b.body.user.id });
    expect(res.body.user.email).toBe("a@example.com");
  });
});

describe("login lockout", () => {
  it("locks the account for 15 minutes after 3 failed attempts", async () => {
    await registerUser();
    for (let i = 0; i < 3; i++) {
      const res = await request(h.app)
        .post("/_api/auth/login_with_password")
        .send({ email: "asha@example.com", password: "Wrong12345" });
      expect(res.status).toBe(401);
    }
    const locked = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "asha@example.com", password: VALID_PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);

    h.clock.advance(15 * 60_000 + 1000);
    const ok = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "asha@example.com", password: VALID_PASSWORD });
    expect(ok.status).toBe(200);
  });

  it("applies the same lockout to unknown emails (no enumeration)", async () => {
    for (let i = 0; i < 3; i++) {
      await request(h.app).post("/_api/auth/login_with_password").send({ email: "ghost@example.com", password: "Wrong12345" });
    }
    const res = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "ghost@example.com", password: "Wrong12345" });
    expect(res.status).toBe(429);
  });
});

describe("rate limiting", () => {
  it("limits registrations per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await registerUser(`user${i}@example.com`);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("limits password-reset requests per IP", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await request(h.app).post("/_api/auth/request_password_reset").send({ email: `x${i}@example.com` })).status;
    }
    expect(last).toBe(429);
  });
});

describe("password reset", () => {
  it("sends one email for a registered address and the same response for unknown ones", async () => {
    await registerUser();
    const known = await request(h.app).post("/_api/auth/request_password_reset").send({ email: "ASHA@example.com" });
    const unknown = await request(h.app).post("/_api/auth/request_password_reset").send({ email: "nobody@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.token).toBeUndefined();
    expect(h.mailer.sent).toHaveLength(1);
    expect(h.mailer.sent[0]!.resetUrl.startsWith("https://tracker.example.test/reset-password#token=")).toBe(true);

    const token = h.mailer.lastToken();
    const stored = await h.c.passwordResetTokens.findOne({});
    expect(stored!.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored!.expiresAt.getTime() - h.clock.now().getTime()).toBe(30 * 60_000);
  });

  it("invalidates earlier unused tokens when a new one is requested", async () => {
    await registerUser();
    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    const first = h.mailer.lastToken();
    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    const res = await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token: first, newPassword: "NewPassword9" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("completes a reset, revokes sessions, and rejects reuse", async () => {
    const reg = await registerUser();
    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    const token = h.mailer.lastToken();

    const done = await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token, newPassword: "NewPassword9" });
    expect(done.status).toBe(200);

    // Old session revoked.
    const old = await request(h.app)
      .get("/_api/auth/session")
      .set("Authorization", `Bearer ${reg.body.tokens.accessToken}`);
    expect(old.status).toBe(401);
    // Old password no longer works, new one does.
    expect(
      (await request(h.app).post("/_api/auth/login_with_password").send({ email: "asha@example.com", password: VALID_PASSWORD })).status,
    ).toBe(401);
    expect(
      (await request(h.app).post("/_api/auth/login_with_password").send({ email: "asha@example.com", password: "NewPassword9" })).status,
    ).toBe(200);

    const reuse = await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token, newPassword: "Another1234" });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("rejects invalid and expired tokens", async () => {
    await registerUser();
    const invalid = await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token: "definitely-not-a-real-token", newPassword: "NewPassword9" });
    expect(invalid.status).toBe(400);

    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    const token = h.mailer.lastToken();
    h.clock.advance(31 * 60_000);
    const expired = await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token, newPassword: "NewPassword9" });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("does not burn the token when the new password is too weak", async () => {
    await registerUser();
    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    const token = h.mailer.lastToken();
    const weak = await request(h.app).post("/_api/auth/complete_password_reset").send({ token, newPassword: "short" });
    expect(weak.status).toBe(400);
    const ok = await request(h.app).post("/_api/auth/complete_password_reset").send({ token, newPassword: "NewPassword9" });
    expect(ok.status).toBe(200);
  });

  it("clears the login lockout after a successful reset", async () => {
    await registerUser();
    for (let i = 0; i < 3; i++) {
      await request(h.app).post("/_api/auth/login_with_password").send({ email: "asha@example.com", password: "Wrong12345" });
    }
    await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    await request(h.app)
      .post("/_api/auth/complete_password_reset")
      .send({ token: h.mailer.lastToken(), newPassword: "NewPassword9" });
    const res = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: "asha@example.com", password: "NewPassword9" });
    expect(res.status).toBe(200);
  });

  it("removes the token when email delivery fails", async () => {
    await registerUser();
    h.mailer.fail = true;
    const res = await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    expect(res.status).toBe(200);
    expect(await h.c.passwordResetTokens.countDocuments()).toBe(0);
    expect(await h.c.securityEvents.countDocuments({ type: "password_reset_email_failed" })).toBe(1);
  });

  it("reports when email delivery is not configured", async () => {
    h.mailer.configured = false;
    const res = await request(h.app).post("/_api/auth/request_password_reset").send({ email: "asha@example.com" });
    expect(res.status).toBe(503);
  });
});

describe("profile and account deletion", () => {
  it("updates the display name", async () => {
    const reg = await registerUser();
    const res = await request(h.app)
      .post("/_api/profile")
      .set("Authorization", `Bearer ${reg.body.tokens.accessToken}`)
      .send({ displayName: "  Asha R  " });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe("Asha R");
  });

  it("deletes the account and its sessions only with the correct password", async () => {
    const reg = await registerUser();
    const auth = `Bearer ${reg.body.tokens.accessToken}`;
    const wrong = await request(h.app).post("/_api/account/delete").set("Authorization", auth).send({ password: "Wrong12345" });
    expect(wrong.status).toBe(401);
    const ok = await request(h.app).post("/_api/account/delete").set("Authorization", auth).send({ password: VALID_PASSWORD });
    expect(ok.status).toBe(200);
    expect(await h.c.users.countDocuments()).toBe(0);
    expect(await h.c.sessions.countDocuments()).toBe(0);
    expect((await request(h.app).get("/_api/auth/session").set("Authorization", auth)).status).toBe(401);
  });
});

describe("health check", () => {
  it("reports database and email status without exposing the key", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp({
      collections: h.c,
      config: { ...h.config, resendApiKey: "re_SECRETVALUE_123456", resendFromEmail: "a@example.com" },
      mailer: h.mailer,
      healthCheck: async () => {
        await h.db.command({ ping: 1 });
      },
      emailStatus: () => ({ key: "valid", keyAccess: "sending_only", sender: "unknown", detail: "ok" }),
    });
    const res = await request(app).get("/_api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      database: "reachable",
      email: { key: "valid", keyAccess: "sending_only", sender: "unknown" },
    });
    expect(JSON.stringify(res.body)).not.toContain("re_SECRET");
  });
});

describe("transport and errors", () => {
  it("answers CORS preflight for the Android app origin only", async () => {
    const ok = await request(h.app)
      .options("/_api/auth/login_with_password")
      .set("Origin", "https://localhost")
      .set("Access-Control-Request-Method", "POST");
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

    const evil = await request(h.app)
      .options("/_api/auth/login_with_password")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(evil.status).toBe(403);
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns safe JSON errors for malformed bodies and unknown routes", async () => {
    const bad = await request(h.app)
      .post("/_api/auth/login_with_password")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("BAD_REQUEST");
    const missing = await request(h.app).get("/_api/nope");
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toMatch(/stack|at /);
  });

  it("rejects operator injection in credentials", async () => {
    await registerUser();
    const res = await request(h.app)
      .post("/_api/auth/login_with_password")
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});
