import type { AppConfig } from "./config.js";

export interface PasswordResetEmail {
  to: string;
  displayName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface Mailer {
  /** True when an email provider is configured. */
  readonly configured: boolean;
  /** Resolves only when the provider accepted the message; throws otherwise. */
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

export function renderPasswordResetEmail(m: PasswordResetEmail): { subject: string; html: string; text: string } {
  const name = m.displayName.trim() || "there";
  const subject = "Reset your Tracker Pro password";
  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset the password for your Tracker Pro account.",
    `Open this link within ${m.expiresInMinutes} minutes to choose a new password:`,
    m.resetUrl,
    "",
    "The link can be used once. If you didn't request this, you can ignore this email; your password will not change.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#FBF7F1;font-family:Helvetica,Arial,sans-serif;color:#3B1F3A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#FFFDF9;border:1px solid #E8DED3;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 16px">Tracker Pro</p>
<p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 20px;line-height:1.5">We received a request to reset your password. This link expires in ${m.expiresInMinutes} minutes and can be used once.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(m.resetUrl)}" style="display:inline-block;background:#5B2A55;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px">Choose a new password</a></p>
<p style="margin:0;font-size:13px;color:#6E5670;line-height:1.5">If you didn't request this, you can ignore this email. Your password won't change.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

/** Sends email through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendMailer(config: Pick<AppConfig, "resendApiKey" | "resendFromEmail">): Mailer {
  const { resendApiKey, resendFromEmail } = config;
  const configured = Boolean(resendApiKey && resendFromEmail);
  return {
    configured,
    async sendPasswordReset(message) {
      if (!resendApiKey || !resendFromEmail) throw new Error("Email provider is not configured");
      const { subject, html, text } = renderPasswordResetEmail(message);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: resendFromEmail, to: [message.to], subject, html, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        // Do not include the response body: it may echo the recipient address.
        throw new Error(`Resend rejected the message (HTTP ${response.status})`);
      }
    },
  };
}
