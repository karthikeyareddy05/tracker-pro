import { describe, expect, it } from "vitest";
import { checkResendConfig, senderDomain } from "../src/emailCheck.js";

const KEY = "re_TESTKEY_1234567890";
const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("Resend configuration check", () => {
  it("parses sender domains", () => {
    expect(senderDomain("Tracker Pro <no-reply@Mail.Example.com>")).toBe("mail.example.com");
    expect(senderDomain("onboarding@resend.dev")).toBe("resend.dev");
    expect(senderDomain("not an email")).toBeNull();
  });

  it("reports missing configuration without calling Resend", async () => {
    const r = await checkResendConfig(null, null, reply(500, {}));
    expect(r).toMatchObject({ key: "not_configured", sender: "not_configured" });
  });

  it("rejects malformed keys locally", async () => {
    const r = await checkResendConfig("  re_abc ", "a@b.com", reply(200, {}));
    expect(r.key).toBe("invalid");
  });

  it("accepts a full-access key and checks the sender domain", async () => {
    const ok = await checkResendConfig(KEY, "Tracker <no-reply@example.com>", reply(200, { data: [{ name: "example.com", status: "verified" }] }));
    expect(ok).toMatchObject({ key: "valid", keyAccess: "full", sender: "domain_verified" });
    const pending = await checkResendConfig(KEY, "no-reply@other.com", reply(200, { data: [{ name: "example.com", status: "verified" }] }));
    expect(pending.sender).toBe("domain_not_verified");
  });

  it("treats a restricted (sending-only) key as valid", async () => {
    const r = await checkResendConfig(KEY, "onboarding@resend.dev", reply(401, { name: "restricted_api_key", message: "x" }));
    expect(r).toMatchObject({ key: "valid", keyAccess: "sending_only", sender: "testing_sender" });
  });

  it("reports an invalid key", async () => {
    const r = await checkResendConfig(KEY, "a@example.com", reply(401, { name: "validation_error" }));
    expect(r.key).toBe("invalid");
  });

  it("never includes the key in its output", async () => {
    for (const fetcher of [reply(200, { data: [] }), reply(401, { name: "restricted_api_key" }), reply(403, {})]) {
      const r = await checkResendConfig(KEY, "a@example.com", fetcher);
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
  });

  it("does not claim success when Resend can't be reached", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await checkResendConfig(KEY, "a@example.com", offline);
    expect(r.key).toBe("unverified");
  });
});
