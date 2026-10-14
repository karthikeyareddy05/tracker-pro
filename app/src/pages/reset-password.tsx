import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, clientPasswordProblem, PasswordField, PasswordStrength } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

/** Reads the token from "#token=…" (preferred) or "?token=…", then removes it from the address bar. */
function useResetToken(): string | null {
  const location = useLocation();
  const [token] = useState<string | null>(() => {
    const fromHash = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
    const fromQuery = new URLSearchParams(location.search).get("token");
    return fromHash || fromQuery || null;
  });
  useEffect(() => {
    if (token && (window.location.hash || window.location.search)) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [token]);
  return token;
}

export default function ResetPasswordPage() {
  const { api, status, logout } = useAuth();
  const token = useResetToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const next: typeof errors = {};
    const pw = clientPasswordProblem(password);
    if (pw) next.password = pw;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      const result = await api.completePasswordReset(token, password);
      setDone(result.message);
      // All sessions were revoked on the server; end this device's session too.
      if (status === "authenticated") await logout();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset link needed" footer={<Link to="/login">Back to sign in</Link>}>
        <div className="stack">
          <Banner tone="warning">
            This page needs the link from your password-reset email. Open the link from the email, or request a new one.
          </Banner>
          <Link to="/forgot-password" className="btn btn--primary btn--block">
            Request a reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="After saving, you'll be signed out everywhere and can sign in with your new password.">
      {done ? (
        <div className="stack">
          <Banner tone="success">{done}</Banner>
          <Link to="/login" className="btn btn--primary btn--block">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError && (
            <Banner tone="error">
              {formError} {formError.includes("expired") && <Link to="/forgot-password">Request a new link</Link>}
            </Banner>
          )}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
          >
            <PasswordStrength password={password} />
          </PasswordField>
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <Button type="submit" block loading={submitting}>
            {submitting ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
