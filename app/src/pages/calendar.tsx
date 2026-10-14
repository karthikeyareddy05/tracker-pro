import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Banner, Button, LoadingBlock, SaveStatus, useSaveState } from "../components/ui";
import { useCycleProfile, useDays, usePeriodStartMutations, usePeriodStarts } from "../hooks/health";
import { useToday } from "../hooks/useToday";
import { computeCycleStatus, estimatedPeriodDays } from "../lib/cycle";
import {
  compareDates,
  formatDate,
  formatLong,
  formatMonthYear,
  monthGrid,
  parts,
  shiftMonth,
  weekdayLabels,
} from "../lib/dates";
import {
  ENERGY_LABELS,
  FLOW_LABELS,
  GLASS_ML,
  MOOD_LABELS,
  SEVERITY_LABELS,
  SLEEP_QUALITY_LABELS,
  SYMPTOM_LABELS,
} from "../lib/labels";
import type { DayEntry } from "../storage/healthStore";

const BLEEDING = new Set(["spotting", "light", "medium", "heavy"]);

function DayDetails({
  date,
  today,
  entry,
  estimated,
  isLoggedStart,
}: {
  date: string;
  today: string;
  entry: DayEntry | undefined;
  estimated: boolean;
  isLoggedStart: boolean;
}) {
  const { add, remove } = usePeriodStartMutations();
  const save = useSaveState();
  const future = compareDates(date, today) > 0;
  const pending = add.isPending || remove.isPending;

  const facts: string[] = [];
  if (entry?.mood) facts.push(`Mood: ${MOOD_LABELS[entry.mood]}`);
  if (entry?.energy) facts.push(`Energy: ${ENERGY_LABELS[entry.energy]}`);
  if (entry?.sleepHours != null)
    facts.push(
      `Sleep: ${entry.sleepHours} h${entry.sleepQuality ? ` (${SLEEP_QUALITY_LABELS[entry.sleepQuality]?.toLowerCase()})` : ""}`,
    );
  if (entry?.waterMl != null) facts.push(`Water: ${Math.round(entry.waterMl / GLASS_ML)} glasses`);

  return (
    <section className="card stack" aria-live="polite" aria-labelledby="day-title">
      <div className="row-between wrap">
        <h2 id="day-title">{formatLong(date)}</h2>
        <SaveStatus state={save.state} error={save.error} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {isLoggedStart && (
          <span className="confirmed-tag">
            <Icon name="check" size={12} /> Logged period start
          </span>
        )}
        {entry?.flow && BLEEDING.has(entry.flow) && <span className="confirmed-tag">Flow: {FLOW_LABELS[entry.flow]}</span>}
        {estimated && <span className="estimate-tag">Estimated period day</span>}
      </div>
      {future ? (
        <p className="muted small">
          {estimated
            ? "Your period may fall around this day, based on your typical cycle length. This is an estimate, not a certainty."
            : "Nothing to show yet for a future day."}
        </p>
      ) : entry ? (
        <div className="stack" style={{ gap: 6 }}>
          {facts.map((f) => (
            <p key={f} className="small">
              {f}
            </p>
          ))}
          {entry.symptoms.length > 0 && (
            <p className="small">
              Symptoms:{" "}
              {entry.symptoms.map((s) => `${SYMPTOM_LABELS[s.name]} (${SEVERITY_LABELS[s.severity].toLowerCase()})`).join(", ")}
            </p>
          )}
          {entry.notes && <p className="small muted">“{entry.notes.length > 140 ? `${entry.notes.slice(0, 140)}…` : entry.notes}”</p>}
        </div>
      ) : (
        <p className="muted small">No check-in recorded for this day.</p>
      )}
      {!future && (
        <div className="row wrap">
          <Link to={`/track?date=${date}`} className="btn btn--primary btn--sm">
            {entry ? "Edit check-in" : "Add check-in"}
          </Link>
          {isLoggedStart ? (
            <Button
              variant="secondary"
              small
              loading={pending}
              onClick={() => void save.track(remove.mutateAsync(date))}
            >
              Remove period start
            </Button>
          ) : (
            <Button variant="secondary" small loading={pending} onClick={() => void save.track(add.mutateAsync(date))}>
              Period started this day
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export default function CalendarPage() {
  const todayStr = useToday();
  const init = parts(todayStr);
  const [view, setView] = useState({ year: init.year, monthIndex: init.monthIndex });
  const [selected, setSelected] = useState(todayStr);

  const grid = useMemo(() => monthGrid(view.year, view.monthIndex), [view]);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;

  const profile = useCycleProfile();
  const starts = usePeriodStarts();
  const days = useDays(from, to);

  const estimates = useMemo(() => {
    if (!profile.data || !starts.data) return new Set<string>();
    const status = computeCycleStatus(profile.data, starts.data, todayStr);
    if (!status) return new Set<string>();
    return estimatedPeriodDays(profile.data, status.anchor, from, to);
  }, [profile.data, starts.data, todayStr, from, to]);

  const byDate = useMemo(() => new Map((days.data ?? []).map((d) => [d.date, d])), [days.data]);
  const startSet = useMemo(() => new Set(starts.data ?? []), [starts.data]);
  const weekdays = useMemo(() => weekdayLabels(), []);

  const move = (delta: number) => setView((v) => shiftMonth(v.year, v.monthIndex, delta));
  const goToday = () => {
    const p = parts(todayStr);
    setView({ year: p.year, monthIndex: p.monthIndex });
    setSelected(todayStr);
  };

  const loading = profile.isPending || starts.isPending;
  const failed = profile.isError || starts.isError || days.isError;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Your cycle</h1>
        </div>
        <Button variant="secondary" small onClick={goToday}>
          Today
        </Button>
      </header>

      {failed && <Banner tone="error">Couldn't read your on-device records for this month.</Banner>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <section className="card" aria-label="Month view">
          <div className="cal-head">
            <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Previous month">
              <Icon name="chevronLeft" />
            </button>
            <h2 aria-live="polite">{formatMonthYear(view.year, view.monthIndex)}</h2>
            <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Next month">
              <Icon name="chevronRight" />
            </button>
          </div>
          <div className="cal-grid" role="grid">
            {weekdays.map((w, i) => (
              <div key={i} className="cal-weekday" aria-hidden="true">
                {w}
              </div>
            ))}
            {grid.map((date) => {
              const p = parts(date);
              const entry = byDate.get(date);
              const flow = entry?.flow && BLEEDING.has(entry.flow);
              const estimated = estimates.has(date);
              const classes = ["cal-day"];
              if (p.monthIndex !== view.monthIndex) classes.push("is-outside");
              if (date === todayStr) classes.push("is-today");
              if (flow || startSet.has(date)) classes.push("is-flow");
              else if (estimated) classes.push("is-estimated");
              if (entry) classes.push("has-log");
              if (date === selected) classes.push("is-selected");
              const labels = [formatDate(date, { weekday: "long", day: "numeric", month: "long" })];
              if (date === todayStr) labels.push("today");
              if (startSet.has(date)) labels.push("logged period start");
              if (flow) labels.push("period flow recorded");
              if (estimated && !flow) labels.push("estimated period day");
              if (entry) labels.push("has check-in");
              return (
                <button
                  key={date}
                  type="button"
                  className={classes.join(" ")}
                  onClick={() => {
                    setSelected(date);
                    if (p.monthIndex !== view.monthIndex) setView({ year: p.year, monthIndex: p.monthIndex });
                  }}
                  aria-label={labels.join(", ")}
                  aria-pressed={date === selected}
                >
                  {p.day}
                </button>
              );
            })}
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="swatch swatch--flow" /> Logged period
            </span>
            <span>
              <i className="swatch swatch--estimate" /> Estimated period
            </span>
            <span>
              <i className="swatch swatch--log" /> Check-in
            </span>
            <span>
              <i className="swatch swatch--selected" /> Selected
            </span>
          </div>
        </section>
      )}

      {!loading && (
        <DayDetails
          date={selected}
          today={todayStr}
          entry={byDate.get(selected)}
          estimated={estimates.has(selected)}
          isLoggedStart={startSet.has(selected)}
        />
      )}

      {!loading && !profile.data?.lastPeriodStart && (starts.data?.length ?? 0) === 0 && (
        <Banner tone="info">
          Estimated period days appear once you add a period start. Tap a day and choose “Period started this day”.
        </Banner>
      )}
      <p className="disclaimer">
        Estimated days are projected from your typical cycle and period lengths. Real cycles vary, so treat them as a
        guide rather than a certainty.
      </p>
    </main>
  );
}
