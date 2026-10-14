import { Link } from "react-router-dom";
import { useUser } from "../auth/AuthProvider";
import { Icon, type IconName } from "../components/Icon";
import { Banner, Button, Chip, EmptyState, LoadingBlock, SaveStatus, useSaveState } from "../components/ui";
import {
  useChecklist,
  useCycleProfile,
  useDay,
  usePeriodStartMutations,
  usePeriodStarts,
  usePreferences,
  useSaveDay,
  useSetChecklistItem,
} from "../hooks/health";
import { useToday } from "../hooks/useToday";
import { computeCycleStatus, type CycleProfile, type CycleStatus } from "../lib/cycle";
import { formatDate, formatLong } from "../lib/dates";
import {
  DEFAULT_WATER_GOAL_GLASSES,
  ENERGY_LABELS,
  GLASS_ML,
  greeting,
  MOOD_LABELS,
  plural,
  SLEEP_QUALITY_LABELS,
} from "../lib/labels";
import { MOODS, type DayEntry, type Mood } from "../storage/healthStore";

function CycleRing({ day, length, inPeriod }: { day: number; length: number; inPeriod: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, day / length);
  return (
    <div className="ring" aria-hidden="true">
      <svg viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={inPeriod ? "var(--rose)" : "var(--plum)"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * progress} ${c}`}
          style={{ transition: "stroke-dasharray 600ms var(--ease)" }}
        />
      </svg>
      <div className="ring-center">
        <span className="big">{day}</span>
        <span className="cap">Cycle day</span>
      </div>
    </div>
  );
}

function CycleCard({ profile, status, today }: { profile: CycleProfile; status: CycleStatus | null; today: string }) {
  const starts = usePeriodStarts();
  const { add } = usePeriodStartMutations();
  const save = useSaveState();
  const loggedToday = starts.data?.includes(today) ?? false;

  const logStart = () => void save.track(add.mutateAsync(today));

  if (!status) {
    return (
      <section className="card card--hero" aria-labelledby="cycle-title">
        <h2 id="cycle-title" className="sr-only">
          Cycle
        </h2>
        <EmptyState
          icon="calendar"
          title="Add a period date to see estimates"
          action={
            <div className="stack" style={{ width: "100%" }}>
              <Button onClick={logStart} loading={add.isPending} block>
                My period started today
              </Button>
              <Link to="/setup?edit=1" className="btn btn--secondary btn--block">
                Enter an earlier date
              </Link>
              <SaveStatus state={save.state} error={save.error} />
            </div>
          }
        >
          Tracker Pro estimates your next period from the first day of your most recent one. Until then, you can still
          track how you feel.
        </EmptyState>
      </section>
    );
  }

  const headline = status.inEstimatedPeriod
    ? `Estimated period day ${status.cycleDay}`
    : status.daysUntilNextPeriod === 0
      ? "Period estimated to start today"
      : `Period in about ${plural(status.daysUntilNextPeriod, "day")}`;

  return (
    <section className="card card--hero stack-lg" aria-labelledby="cycle-title">
      <div className="cycle-hero">
        <CycleRing day={status.cycleDay} length={profile.cycleLength} inPeriod={status.inEstimatedPeriod} />
        <div className="stack" style={{ gap: 8 }}>
          <span className="estimate-tag">Estimate</span>
          <h2 id="cycle-title">{headline}</h2>
          <p className="muted small">
            Next period estimated around <strong>{formatDate(status.nextPeriodStart, { weekday: "short", day: "numeric", month: "short" })}</strong>
          </p>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{profile.cycleLength}</div>
          <div className="stat-label">Typical cycle (days)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{profile.periodLength}</div>
          <div className="stat-label">Typical period (days)</div>
        </div>
      </div>
      <p className="tiny">
        Based on the period start {status.anchorSource === "logged" ? "you logged" : "from your setup"} on{" "}
        {formatDate(status.anchor, { day: "numeric", month: "long" })}.
      </p>
      {status.stale && (
        <Banner tone="warning">
          Your last recorded period start was a while ago, so these estimates are less reliable. Log your most recent start
          to update them.
        </Banner>
      )}
      {loggedToday ? (
        <p className="row small">
          <span className="confirmed-tag">
            <Icon name="check" size={12} /> Logged
          </span>
          You logged a period start today.
        </p>
      ) : (
        <div className="row-between wrap">
          <Button variant="secondary" small onClick={logStart} loading={add.isPending}>
            My period started today
          </Button>
          <SaveStatus state={save.state} error={save.error} />
        </div>
      )}
    </section>
  );
}

function MoodCheckIn({ today, entry }: { today: string; entry: DayEntry | null | undefined }) {
  const saveDay = useSaveDay();
  const save = useSaveState();
  const current = entry?.mood ?? null;
  const choose = (mood: Mood) =>
    void save.track(saveDay.mutateAsync({ date: today, patch: { mood: current === mood ? null : mood } }));
  return (
    <section className="card" aria-labelledby="mood-title">
      <div className="card-header">
        <h2 id="mood-title">How are you feeling?</h2>
        <SaveStatus state={save.state} error={save.error} />
      </div>
      <div className="chips">
        {MOODS.map((m) => (
          <Chip key={m} pressed={current === m} onClick={() => choose(m)} disabled={saveDay.isPending}>
            {MOOD_LABELS[m]}
          </Chip>
        ))}
      </div>
    </section>
  );
}

function QuickLinks({ entry, waterGoal }: { entry: DayEntry | null | undefined; waterGoal: number }) {
  const tiles: { to: string; label: string; sub: string; icon: IconName; tone: string }[] = [
    {
      to: "/track#symptoms",
      label: "Symptoms",
      sub: entry?.symptoms.length ? plural(entry.symptoms.length, "logged") : "Not logged",
      icon: "activity",
      tone: "rose",
    },
    {
      to: "/track#energy",
      label: "Energy",
      sub: entry?.energy ? ENERGY_LABELS[entry.energy] ?? "Logged" : "Not logged",
      icon: "zap",
      tone: "amber",
    },
    {
      to: "/track#sleep",
      label: "Sleep",
      sub:
        entry?.sleepHours != null
          ? `${entry.sleepHours} h${entry.sleepQuality ? ` · ${SLEEP_QUALITY_LABELS[entry.sleepQuality]}` : ""}`
          : "Not logged",
      icon: "moon",
      tone: "plum",
    },
    {
      to: "/track#hydration",
      label: "Hydration",
      sub: entry?.waterMl != null ? `${Math.round(entry.waterMl / GLASS_ML)} of ${waterGoal} glasses` : "Not logged",
      icon: "droplet",
      tone: "sage",
    },
  ];
  return (
    <section aria-labelledby="quick-title" className="stack">
      <h2 id="quick-title" className="section-title">
        Today's check-in
      </h2>
      <div className="quick-grid">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="quick-tile">
            <span className={`tile-icon tile-icon--${t.tone}`}>
              <Icon name={t.icon} size={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              {t.label}
              <span className="tile-sub">{t.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Checklist({ today, status }: { today: string; status: CycleStatus | null }) {
  const checklist = useChecklist(today);
  const setItem = useSetChecklistItem();
  const save = useSaveState();
  const items: { key: string; label: string }[] = [{ key: "water", label: "Drink water through the day" }];
  if (status && (status.inEstimatedPeriod || status.daysUntilNextPeriod <= 3)) {
    items.push({ key: "supplies", label: "Pack period supplies" });
  }
  items.push(
    { key: "move", label: "Move or stretch for a few minutes" },
    { key: "nourish", label: "Eat a proper meal" },
    { key: "wind_down", label: "Wind down before bed" },
  );

  if (checklist.isPending) return <LoadingBlock />;
  return (
    <section className="card" aria-labelledby="checklist-title">
      <div className="card-header">
        <h2 id="checklist-title">Daily preparation</h2>
        <SaveStatus state={save.state} error={save.error} />
      </div>
      {checklist.isError ? (
        <Banner tone="error">Couldn't load today's checklist.</Banner>
      ) : (
        <ul className="checklist">
          {items.map((item) => (
            <li key={item.key}>
              <label>
                <input
                  type="checkbox"
                  checked={checklist.data?.[item.key] ?? false}
                  disabled={setItem.isPending}
                  onChange={(e) =>
                    void save.track(setItem.mutateAsync({ date: today, key: item.key, done: e.target.checked }))
                  }
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function HomePage() {
  const user = useUser();
  const todayStr = useToday();
  const profile = useCycleProfile();
  const starts = usePeriodStarts();
  const day = useDay(todayStr);
  const prefs = usePreferences();

  if (profile.isPending || starts.isPending) return <LoadingBlock />;
  if (profile.isError || starts.isError) {
    return (
      <main className="page">
        <Banner tone="error">Couldn't read your on-device records. Please restart the app.</Banner>
      </main>
    );
  }
  const status = computeCycleStatus(profile.data, starts.data, todayStr);
  const firstName = user.displayName.split(" ")[0] || "there";
  const waterGoal = Number(prefs.data?.water_goal_glasses ?? DEFAULT_WATER_GOAL_GLASSES) || DEFAULT_WATER_GOAL_GLASSES;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatLong(todayStr)}</p>
          <h1>
            {greeting(new Date().getHours())}, {firstName}
          </h1>
        </div>
      </header>

      {profile.data && <CycleCard profile={profile.data} status={status} today={todayStr} />}
      {day.isError ? (
        <Banner tone="error">Couldn't load today's check-in.</Banner>
      ) : (
        <>
          <MoodCheckIn today={todayStr} entry={day.data} />
          <QuickLinks entry={day.data} waterGoal={waterGoal} />
        </>
      )}
      <Checklist today={todayStr} status={status} />

      <nav className="card card--tint stack" aria-label="More">
        <div className="row-between">
          <Link to="/calendar">Open calendar</Link>
          <Link to="/insights">See insights</Link>
          <Link to="/profile">Profile</Link>
        </div>
      </nav>
      <p className="disclaimer">
        Tracker Pro is a personal wellness tracker, not a medical device. Cycle timing varies between people and from
        month to month; estimates aren't medical advice. Talk to a healthcare professional about any concerns.
      </p>
    </main>
  );
}
