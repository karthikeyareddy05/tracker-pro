import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, isValidEmail, TextField } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

export default function ForgotPasswordPage() {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.requestPasswordReset(email.trim());
      setSentMessage(result.message);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send a link to choose a new password."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {sentMessage ? (
        <div className="stack">
          <Banner tone="success">{sentMessage}</Banner>
          <p className="muted small">
            The link expires in 30 minutes and works once. Check your spam folder if it doesn't arrive in a few minutes.
            You can open the link on this phone or any device.
          </p>
          <Button variant="secondary" block onClick={() => setSentMessage(null)}>
            Send another link
          </Button>
        </div>
      ) : (
        <form className="form" onSubmit={onSubmit} noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" block loading={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
