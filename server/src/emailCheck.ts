/**
 * Verifies the Resend configuration without sending an email and without ever
 * logging or returning the API key.
 *
 * It calls Resend's "list domains" endpoint:
 *  - 200            → key valid with full access; we can also see whether the sender's domain is verified.
 *  - 401 restricted → key valid but limited to sending (the recommended setup); domain status unknown.
 *  - other 401/403  → key rejected.
 */
export type KeyStatus = "not_configured" | "valid" | "invalid" | "unverified";
export type SenderStatus =
  | "not_configured"
  | "invalid_format"
  | "testing_sender"
  | "domain_verified"
  | "domain_not_verified"
  | "unknown";

export interface EmailCheckResult {
  key: KeyStatus;
  /** "full" or "sending_only" when the key is valid. */
  keyAccess?: "full" | "sending_only";
  sender: SenderStatus;
  /** Human-readable explanation, safe to log (contains no secrets). */
  detail: string;
}

export function senderDomain(from: string): string | null {
  // Accepts "name@domain" or "Display Name <name@domain>".
  const match = /<?([^<>\s@]+)@([^<>\s@]+\.[^<>\s@]+)>?\s*$/.exec(from.trim());
  return match ? match[2]!.toLowerCase() : null;
}

export async function checkResendConfig(
  apiKey: string | null,
  fromEmail: string | null,
  fetcher: typeof fetch = fetch,
): Promise<EmailCheckResult> {
  if (!apiKey) {
    return { key: "not_configured", sender: fromEmail ? "unknown" : "not_configured", detail: "RESEND_API_KEY is not set." };
  }
  if (!/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) {
    return {
      key: "invalid",
      sender: "unknown",
      detail: "RESEND_API_KEY doesn't look like a Resend key (it should start with \"re_\"). Check for extra spaces or quotes.",
    };
  }

  let domain: string | null = null;
  let sender: SenderStatus = "not_configured";
  if (fromEmail) {
    domain = senderDomain(fromEmail);
    sender = !domain ? "invalid_format" : domain === "resend.dev" ? "testing_sender" : "unknown";
  }

  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { key: "unverified", sender, detail: "Couldn't reach api.resend.com to check the key (network error)." };
  }

  type ResendDomainsBody = { name?: string; data?: { name?: string; status?: string }[] };
  let body: ResendDomainsBody | null = null;
  try {
    body = (await response.json()) as ResendDomainsBody;
  } catch {
    body = null;
  }

  if (response.ok) {
    const domains = body?.data;
    if (domain && domain !== "resend.dev" && Array.isArray(domains)) {
      const match = domains.find((d) => d.name?.toLowerCase() === domain);
      sender = match?.status === "verified" ? "domain_verified" : "domain_not_verified";
    }
    return { key: "valid", keyAccess: "full", sender, detail: "Resend accepted the API key (full access)." };
  }
  if (response.status === 401 && body?.name === "restricted_api_key") {
    return {
      key: "valid",
      keyAccess: "sending_only",
      sender,
      detail: "Resend accepted the API key (sending access only, so the sender domain's status can't be checked from here).",
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { key: "invalid", sender, detail: `Resend rejected the API key (HTTP ${response.status}).` };
  }
  return { key: "unverified", sender, detail: `Resend returned HTTP ${response.status}; key not confirmed.` };
}
