import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { renderPasswordResetEmail } from "../src/mailer.js";
import { hashPassword, normalizeEmail, passwordProblem, verifyPassword } from "../src/security.js";

process.env.ARGON2_TEST_FAST = "1";

describe("password hashing", () => {
  it("produces salted argon2id hashes that verify", async () => {
    const a = await hashPassword("Lavender42!");
    const b = await hashPassword("Lavender42!");
    expect(a).not.toBe(b);
    expect(a.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(a, "Lavender42!")).toBe(true);
    expect(await verifyPassword(a, "lavender42!")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("validation helpers", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
  });
  it("enforces the password policy", () => {
    expect(passwordProblem("short1")).toMatch(/at least 8/);
    expect(passwordProblem("onlyletters")).toMatch(/letter and one number/);
    expect(passwordProblem("12345678")).toMatch(/letter and one number/);
    expect(passwordProblem("priyanka2024", "priyanka@example.com")).toMatch(/email/);
    expect(passwordProblem("Lavender42!")).toBeNull();
  });
});

describe("config", () => {
  it("requires MONGODB_URI and https base URL in production", () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI/);
    expect(() => loadConfig({ MONGODB_URI: "mongodb://x", NODE_ENV: "production", APP_BASE_URL: "http://x.com" })).toThrow(
      /https/,
    );
    const cfg = loadConfig({ MONGODB_URI: "mongodb://x", APP_BASE_URL: "https://app.example.com/" });
    expect(cfg.appBaseUrl).toBe("https://app.example.com");
    expect(cfg.corsOrigins).toContain("https://localhost");
    expect(cfg.loginMaxFailures).toBe(3);
    expect(cfg.loginLockoutMs).toBe(15 * 60_000);
    expect(cfg.resetTokenTtlMs).toBe(30 * 60_000);
    expect(cfg.mongodbDbName).toBe("tracker_pro");
  });
});

describe("reset email", () => {
  it("escapes user-controlled content", () => {
    const { html, text } = renderPasswordResetEmail({
      to: "a@example.com",
      displayName: "<script>alert(1)</script>",
      resetUrl: "https://x.test/reset-password#token=abc",
      expiresInMinutes: 30,
    });
    expect(html).not.toContain("<script>");
    expect(text).toContain("30 minutes");
  });
});

describe("secret redaction", () => {
  it("masks credentials in connection strings and Resend keys", async () => {
    const { redact } = await import("../src/redact.js");
    expect(redact("connect failed mongodb+srv://example-user:not-a-real-password@cluster0.abc.mongodb.net/db")).toBe(
      "connect failed mongodb+srv://***:***@cluster0.abc.mongodb.net/db",
    );
    expect(redact("bad key re_ABCDEFGHIJ")).toBe("bad key re_***");
  });
});
