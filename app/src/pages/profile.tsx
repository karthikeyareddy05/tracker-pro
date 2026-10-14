import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../auth/api";
import { useAuth, useUser } from "../auth/AuthProvider";
import { Icon, type IconName } from "../components/Icon";
import { Banner, Button, Dialog, PasswordField, TextField } from "../components/ui";
import { useCycleProfile, useDeleteLocalHealthData, useRecordCounts } from "../hooks/health";
import { formatDate } from "../lib/dates";
import { plural } from "../lib/labels";
import { useThemePref, type ThemePref } from "../lib/theme";
import { useHealthStore } from "../storage/StorageProvider";

function AccountCard() {
  const user = useUser();
  const { authedRequest, api, setUser, offline } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name can't be empty.");
    if (trimmed.length > 80) return setError("Use 80 characters or fewer.");
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await authedRequest((token) => api.updateProfile(token, trimmed));
      setUser(updated);
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update your name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="account-title">
      <div className="card-header">
        <h2 id="account-title">Account</h2>
        {!editing && (
          <button type="button" className="link-btn small" onClick={() => { setEditing(true); setSaved(false); setName(user.displayName); }} disabled={offline}>
            Edit name
          </button>
        )}
      </div>
      {editing ? (
        <div className="form">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={80} autoComplete="name" />
          <div className="row">
            <Button small loading={saving} onClick={() => void saveName()}>
              Save
            </Button>
            <Button small variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="list" style={{ margin: 0 }}>
          <div className="list-row">
            <dt>Name</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div className="list-row">
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      )}
      {saved && <Banner tone="success">Name updated.</Banner>}
      {offline && <p className="tiny">You're offline. Account changes need a connection.</p>}
    </section>
  );
}

function CycleCard() {
  const profile = useCycleProfile();
  const p = profile.data;
  return (
    <section className="card" aria-labelledby="cycle-setup-title">
      <div className="card-header">
        <h2 id="cycle-setup-title">Cycle setup</h2>
        <Link to="/setup?edit=1" className="small">
          Update
        </Link>
      </div>
      {p ? (
        <dl className="list" style={{ margin: 0 }}>
          <div className="list-row">
            <dt>Typical cycle</dt>
            <dd>{p.cycleLength} days</dd>
          </div>
          <div className="list-row">
            <dt>Typical period</dt>
            <dd>{p.periodLength} days</dd>
          </div>
          <div className="list-row">
            <dt>Most recent period start</dt>
            <dd>{p.lastPeriodStart ? formatDate(p.lastPeriodStart, { day: "numeric", month: "short", year: "numeric" }) : "Not set"}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted small">No cycle setup saved.</p>
      )}
    </section>
  );
}

function ThemeCard() {
  const [pref, setPref] = useThemePref();
  const options: { value: ThemePref; label: string; icon: IconName }[] = [
    { value: "system", label: "System", icon: "monitor" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];
  return (
    <section className="card" aria-labelledby="theme-title">
      <div className="card-header">
        <h2 id="theme-title">Appearance</h2>
      </div>
      <div className="theme-options" role="group" aria-label="Theme">
        {options.map((o) => (
          <button key={o.value} type="button" className="theme-option" aria-pressed={pref === o.value} onClick={() => setPref(o.value)}>
            <Icon name={o.icon} />
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PrivacyCard() {
  const store = useHealthStore();
  const counts = useRecordCounts();
  const native = store.kind === "native-sqlite";
  return (
    <section className="card stack" aria-labelledby="privacy-title">
      <div className="card-header" style={{ marginBottom: 0 }}>
        <h2 id="privacy-title">Privacy & storage</h2>
        <Icon name="shield" />
      </div>
      <div className="prose">
        <p>
          <strong>
            <Icon name="phone" size={14} /> On this phone:
          </strong>{" "}
          your cycle setup, period starts, moods, symptoms, energy, sleep, hydration, notes, checklist and preferences.
          {native
            ? " They're kept in a private app database that other apps can't read. The app doesn't add its own encryption to it; it relies on Android's app sandbox and your phone's storage encryption, so keep a screen lock on your phone."
            : " In this browser preview they're kept in the browser's local storage, unencrypted — this is a development mode and not the same as the Android app."}
        </p>
        <p>
          <strong>
            <Icon name="cloud" size={14} /> On Tracker Pro's server:
          </strong>{" "}
          your name, email, a one-way password hash, sign-in sessions, password-reset requests and a minimal security log
          (for example, sign-ins and lockouts, kept up to 90 days). No health records are sent to the server.
        </p>
        <p>
          Health records aren't backed up anywhere. If you uninstall the app or lose your phone, they can't be recovered.
          Signing out keeps them on this phone for when you sign back in.
        </p>
      </div>
      {counts.data && (
        <p className="tiny">
          Stored on this device for your account: {plural(counts.data.days, "day")} of check-ins,{" "}
          {plural(counts.data.periodStarts, "period start")}.
        </p>
      )}
    </section>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const { logout, authedRequest, api, endSession, offline } = useAuth();
  const deleteLocal = useDeleteLocalHealthData();
  const [dialog, setDialog] = useState<null | "logout" | "local" | "account">(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [alsoLocal, setAlsoLocal] = useState(true);
  const [localDone, setLocalDone] = useState(false);

  const close = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
    setPassword("");
  };

  async function doLogout() {
    setBusy(true);
    await logout();
    setBusy(false);
    navigate("/login", { replace: true });
  }

  async function doDeleteLocal() {
    setBusy(true);
    setError(null);
    try {
      await deleteLocal.mutateAsync();
      setLocalDone(true);
      setDialog(null);
      navigate("/setup", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete local data.");
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteAccount() {
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError(null);
    try {
      await authedRequest((token) => api.deleteAccount(token, password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete your account.");
      setBusy(false);
      return;
    }
    let localNote = "";
    if (alsoLocal) {
      try {
        await deleteLocal.mutateAsync();
      } catch {
        localNote = " Health records on this phone couldn't be deleted; you can clear the app's storage in Android settings.";
      }
    }
    setBusy(false);
    await endSession(`Your account was deleted.${alsoLocal ? "" : " Your health records are still on this phone."}${localNote}`);
    navigate("/login", { replace: true });
  }

  return (
    <section className="card stack" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>
      {localDone && <Banner tone="success">Health records on this phone were deleted.</Banner>}
      <Button variant="secondary" block onClick={() => setDialog("logout")}>
        <Icon name="logout" size={18} /> Sign out
      </Button>
      <Button variant="danger" block onClick={() => setDialog("local")}>
        <Icon name="trash" size={18} /> Delete health data on this phone
      </Button>
      <Button variant="ghost" block onClick={() => setDialog("account")} disabled={offline}>
        Delete my account
      </Button>
      {offline && <p className="tiny">Account deletion needs a connection.</p>}

      {dialog === "logout" && (
        <Dialog title="Sign out?" onClose={close}>
          <p className="muted">
            Your session on this phone will end. Your health records stay on this phone and will be there when you sign back
            in. To remove them, use “Delete health data on this phone”.
          </p>
          <div className="stack">
            <Button block loading={busy} onClick={() => void doLogout()}>
              Sign out
            </Button>
            <Button variant="secondary" block onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}

      {dialog === "local" && (
        <Dialog title="Delete health data on this phone?" onClose={close}>
          <p className="muted">
            This permanently deletes your cycle setup, period starts and every check-in stored on this phone for your
            account. There's no backup, so this can't be undone. Your account and sign-in are not affected.
          </p>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="stack">
            <Button variant="danger-solid" block loading={busy} onClick={() => void doDeleteLocal()}>
              Delete permanently
            </Button>
            <Button variant="secondary" block onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}

      {dialog === "account" && (
        <Dialog title="Delete your account?" onClose={close}>
          <p className="muted">
            This permanently deletes your account from Tracker Pro's server: your name, email, password hash, sessions,
            reset requests and security log entries. An anonymous note that an account was deleted is kept.
          </p>
          <label className="checkbox-row">
            <input type="checkbox" checked={alsoLocal} onChange={(e) => setAlsoLocal(e.target.checked)} />
            <span>Also delete my health records stored on this phone</span>
          </label>
          <PasswordField label="Confirm with your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Banner tone="error">{error}</Banner>}
          <div className="stack">
            <Button variant="danger-solid" block loading={busy} onClick={() => void doDeleteAccount()}>
              Delete account
            </Button>
            <Button variant="secondary" block onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

export default function ProfilePage() {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>You & your data</h1>
        </div>
      </header>
      <AccountCard />
      <CycleCard />
      <ThemeCard />
      <PrivacyCard />
      <DangerZone />
      <section className="card card--tint stack" aria-labelledby="about-title">
        <h2 id="about-title">About Tracker Pro</h2>
        <p className="disclaimer">
          Tracker Pro is a personal tracking and wellness app, not a medical device. It doesn't diagnose conditions or
          determine fertility or pregnancy, and its cycle estimates are arithmetic projections from what you enter. Always
          seek advice from a qualified healthcare professional about your health.
        </p>
        <p className="tiny">Version {__APP_VERSION__}</p>
      </section>
    </main>
  );
}
