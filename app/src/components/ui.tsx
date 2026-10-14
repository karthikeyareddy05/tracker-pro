import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";

/* ------------------------------ Button ------------------------------ */

type Variant = "primary" | "secondary" | "sage" | "ghost" | "danger" | "danger-solid";

export function Button({
  variant = "primary",
  block,
  small,
  loading,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  small?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${block ? " btn--block" : ""}${small ? " btn--sm" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner spinner--sm" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ------------------------------ Fields ------------------------------ */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, hint, error, id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={`input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {hint && !error && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
});

export function PasswordField({ label, hint, error, id, children, ...rest }: FieldProps & { children?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="password-wrap">
        <input
          id={inputId}
          className="input"
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...rest}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <Icon name={visible ? "eyeOff" : "eye"} />
        </button>
      </div>
      {children}
      {hint && !error && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Rough strength estimate for guidance only; the server enforces the real policy. */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (!(/[A-Za-z]/.test(pw) && /[0-9]/.test(pw))) score = Math.min(score, 1);
  return Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
}

export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return (
    <div aria-live="polite">
      <div className="strength" data-score={score} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      {password && <span className="field-hint">Strength: {labels[score]}</span>}
    </div>
  );
}

/** Password rules mirrored from the server so users see them before submitting. */
export function clientPasswordProblem(pw: string, email?: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  if (/^(.)\1+$/.test(pw)) return "That password is too easy to guess.";
  const local = (email ?? "").trim().toLowerCase().split("@")[0] ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return "Don't include your email address in your password.";
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.trim().length <= 254;
}

/* ------------------------------ Feedback ------------------------------ */

const bannerIcon: Record<string, IconName> = {
  info: "info",
  success: "check",
  warning: "alert",
  error: "alert",
};

export function Banner({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={bannerIcon[tone] ?? "info"} size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" style={{ display: "inline-flex", color: "var(--plum)" }}>
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="spinner" aria-hidden="true" style={{ color: "var(--plum)" }} />
      <span className="small">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = "sparkle",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveStatus({ state, error }: { state: SaveState; error?: string | null }) {
  if (state === "idle") return <span className="save-status" aria-live="polite" />;
  return (
    <span className="save-status" data-state={state} aria-live="polite">
      {state === "saving" && (
        <>
          <span className="spinner spinner--sm" aria-hidden="true" /> Saving…
        </>
      )}
      {state === "saved" && (
        <>
          <Icon name="check" size={14} /> Saved on this phone
        </>
      )}
      {state === "error" && (
        <>
          <Icon name="alert" size={14} /> {error ?? "Couldn't save. Try again."}
        </>
      )}
    </span>
  );
}

/** Tracks a save operation; "saved" only appears after the write actually succeeds. */
export function useSaveState() {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function track<T>(work: Promise<T>): Promise<T | undefined> {
    window.clearTimeout(timer.current);
    setState("saving");
    setError(null);
    try {
      const result = await work;
      setState("saved");
      timer.current = window.setTimeout(() => setState("idle"), 2500);
      return result;
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      return undefined;
    }
  }
  return { state, error, track };
}

/* ------------------------------ Choice controls ------------------------------ */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  tone,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "rose" | "sage";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip${tone ? ` chip--${tone}` : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  error,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  error?: string | null;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
        >
          <Icon name="minus" />
        </button>
        <input
          id={id}
          className="input"
          inputMode="numeric"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
            setText(raw);
            if (raw !== "") onChange(Number(raw));
          }}
          onBlur={() => {
            if (text === "") setText(String(value));
          }}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
        >
          <Icon name="plus" />
        </button>
        {unit && <span className="muted small">{unit}</span>}
      </div>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="field-hint">
          Between {min} and {max}
          {unit ? ` ${unit}` : ""}.
        </span>
      )}
    </div>
  );
}

/* ------------------------------ Dialog ------------------------------ */

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
