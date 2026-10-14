import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, serverConfigProblem } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import {
  Banner,
  Button,
  clientPasswordProblem,
  isValidEmail,
  PasswordField,
  PasswordStrength,
  TextField,
} from "../components/ui";
import { AuthLayout } from "./AuthLayout";

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  terms?: string;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const configProblem = serverConfigProblem();

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Tell us what to call you.";
    else if (name.trim().length > 80) next.name = "Use 80 characters or fewer.";
    else if (/[<>]/.test(name)) next.name = "Please remove < and > characters.";
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    const pw = clientPasswordProblem(password, email);
    if (pw) next.password = pw;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    if (!agreed) next.terms = "Please confirm you've read how your data is stored.";
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/setup", { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "We couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your health records stay on this phone. Your account lets you sign in securely."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        {configProblem && <Banner tone="warning">{configProblem}</Banner>}
        {formError && <Banner tone="error">{formError}</Banner>}
        <TextField
          label="Full name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={80}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number. Longer is stronger."
        >
          <PasswordStrength password={password} />
        </PasswordField>
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <div className="field">
          <label className="checkbox-row">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I understand my name, email and a password hash are stored on Tracker Pro's server for sign-in, and my
              cycle and wellness records are stored only on this phone. Tracker Pro is not a medical device.
            </span>
          </label>
          {errors.terms && (
            <span className="field-error" role="alert">
              {errors.terms}
            </span>
          )}
        </div>
        <Button type="submit" block loading={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
