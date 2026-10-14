import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, isTestAccountsBuild, serverConfigProblem } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, isValidEmail, PasswordField, TextField } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

export default function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const configProblem = serverConfigProblem();

  useEffect(() => {
    if (notice) setFormError(null);
  }, [notice]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearNotice();
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Sign-in failed. Please try again.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see your cycle, check-ins and insights."
      footer={
        <>
          New to Tracker Pro? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        {configProblem && <Banner tone="warning">{configProblem}</Banner>}
        {isTestAccountsBuild() && (
          <Banner tone="info">
            Test build: sign in with one of the test accounts. It works without a server; your entries stay on this phone.
          </Banner>
        )}
        {notice && <Banner tone="info">{notice}</Banner>}
        {formError && <Banner tone="error">{formError}</Banner>}
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div style={{ textAlign: "right", marginTop: -6 }}>
          <Link to="/forgot-password" className="small">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" block loading={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="tiny" style={{ textAlign: "center" }}>
          You'll stay signed in on this phone until you sign out.
        </p>
      </form>
    </AuthLayout>
  );
}
