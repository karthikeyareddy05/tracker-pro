import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import {
  Banner,
  Button,
  Chip,
  Dialog,
  LoadingBlock,
  SaveStatus,
  Segmented,
  useSaveState,
} from "../components/ui";
import { useDay, useDays, useDeleteDay, usePreferences, useSaveDay, useSetPreference } from "../hooks/health";
import { useToday } from "../hooks/useToday";
import { addDays, compareDates, formatDate, isDateStr, relativeDayLabel, rangeDates } from "../lib/dates";
import {
  DEFAULT_WATER_GOAL_GLASSES,
  ENERGY_LABELS,
  FLOW_LABELS,
  GLASS_ML,
  MOOD_LABELS,
  SEVERITY_LABELS,
  SLEEP_QUALITY_LABELS,
  SYMPTOM_LABELS,
} from "../lib/labels";
import {
  EMPTY_FIELDS,
  FLOWS,
  MOODS,
  SYMPTOMS,
  type DayEntry,
  type DayFields,
  type Severity,
  type Symptom,
  type SymptomName,
} from "../storage/healthStore";

type Draft = DayFields & { symptoms: Symptom[] };

function draftFrom(entry: DayEntry | null | undefined): Draft {
  if (!entry) return { ...EMPTY_FIELDS, symptoms: [] };
  const { date: _d, updatedAt: _u, ...rest } = entry;
  return { ...rest, symptoms: [...entry.symptoms] };
}

function Section({
  id,
  title,
  icon,
  status,
  onClear,
  canClear,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  status: ReturnType<typeof useSaveState>;
  onClear?: () => void;
  canClear?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card track-section" aria-labelledby={`${id}-title`}>
      <div className="track-section-head">
        <h2 id={`${id}-title`}>
          <Icon name={icon} size={18} /> {title}
        </h2>
        <div className="row" style={{ gap: 8 }}>
          <SaveStatus state={status.state} error={status.error} />
          {onClear && canClear && (
            <button type="button" className="link-btn small" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function ValueStepper({
  value,
  onChange,
  min,
  max,
  step,
  initial,
  format,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Value set by the first tap when nothing has been recorded yet. */
  initial: number;
  format: (v: number) => string;
  label: string;
}) {
  const current = value;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={current !== null && current <= min}
        onClick={() => onChange(current === null ? initial : Math.max(min, current - step))}
      >
        <Icon name="minus" />
      </button>
      <strong style={{ minWidth: 96, textAlign: "center", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {current === null ? "Not logged" : format(current)}
      </strong>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={current !== null && current >= max}
        onClick={() => onChange(current === null ? initial : Math.min(max, current + step))}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}

export default function TrackPage() {
  const todayStr = useToday();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const paramDate = params.get("date");
  const date = paramDate && isDateStr(paramDate) && compareDates(paramDate, todayStr) <= 0 ? paramDate : todayStr;
  const setDate = (d: string) => setParams(d === todayStr ? {} : { date: d }, { replace: true });

  const day = useDay(date);
  const prefs = usePreferences();
  const saveDay = useSaveDay();
  const deleteDay = useDeleteDay();
  const setPref = useSetPreference();

  const stripEnd = useMemo(() => {
    const candidate = addDays(date, 3);
    return compareDates(candidate, todayStr) > 0 ? todayStr : candidate;
  }, [date, todayStr]);
  const strip = useMemo(() => rangeDates(addDays(stripEnd, -6), stripEnd), [stripEnd]);
  const stripDays = useDays(strip[0]!, strip[strip.length - 1]!);
  const loggedInStrip = new Set((stripDays.data ?? []).map((d) => d.date));

  const [draft, setDraft] = useState<Draft>(() => draftFrom(day.data));
  const [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync local state whenever the stored record (or the date) changes.
  useEffect(() => {
    if (day.isSuccess) {
      setDraft(draftFrom(day.data));
      setNotes(day.data?.notes ?? "");
    }
  }, [day.isSuccess, day.data, date]);

  // Scroll to a section when arriving from a Home quick link (/track#sleep).
  useEffect(() => {
    if (!location.hash || day.isPending) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, day.isPending]);

  const status = {
    mood: useSaveState(),
    flow: useSaveState(),
    symptoms: useSaveState(),
    energy: useSaveState(),
    sleep: useSaveState(),
    hydration: useSaveState(),
    notes: useSaveState(),
    day: useSaveState(),
  };

  const waterGoal = Number(prefs.data?.water_goal_glasses ?? DEFAULT_WATER_GOAL_GLASSES) || DEFAULT_WATER_GOAL_GLASSES;

  /**
   * Shows the change immediately, writes it to the device, and rolls the screen
   * back if the write fails. "Saved" appears only after the write succeeds.
   */
  async function save(section: keyof typeof status, patch: Partial<Draft>) {
    const previous = draft;
    setDraft((d) => ({ ...d, ...patch }));
    const ok = await status[section].track(saveDay.mutateAsync({ date, patch }).then(() => true));
    if (!ok) setDraft(previous);
  }

  const toggleSymptom = (name: SymptomName) => {
    const has = draft.symptoms.find((s) => s.name === name);
    const next = has ? draft.symptoms.filter((s) => s.name !== name) : [...draft.symptoms, { name, severity: 2 as Severity }];
    void save("symptoms", { symptoms: next });
  };
  const setSeverity = (name: SymptomName, severity: Severity) => {
    void save("symptoms", { symptoms: draft.symptoms.map((s) => (s.name === name ? { ...s, severity } : s)) });
  };

  const glasses = draft.waterMl === null ? null : Math.round(draft.waterMl / GLASS_ML);
  const hasAnything =
    !!day.data && (Object.values(draftFrom(day.data)).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null)));

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Track</p>
          <h1>{relativeDayLabel(date, todayStr)}</h1>
        </div>
      </header>

      <div className="date-nav">
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <Icon name="chevronLeft" />
        </button>
        <span className="date-label">{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next day"
          disabled={compareDates(date, todayStr) >= 0}
          onClick={() => setDate(addDays(date, 1))}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="week-strip" role="group" aria-label="Recent days">
        {strip.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === date}
            onClick={() => setDate(d)}
            aria-label={`${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}${loggedInStrip.has(d) ? ", has check-in" : ""}`}
          >
            <span>{formatDate(d, { weekday: "narrow" })}</span>
            <strong>{formatDate(d, { day: "numeric" })}</strong>
            <span className={`dot${loggedInStrip.has(d) ? "" : " hidden"}`} />
          </button>
        ))}
      </div>

      {day.isPending ? (
        <LoadingBlock />
      ) : day.isError ? (
        <Banner tone="error">Couldn't read this day from on-device storage.</Banner>
      ) : (
        <>
          <Section
            id="mood"
            title="Mood"
            icon="smile"
            status={status.mood}
            canClear={draft.mood !== null}
            onClear={() => void save("mood", { mood: null })}
          >
            <div className="chips">
              {MOODS.map((m) => (
                <Chip key={m} pressed={draft.mood === m} onClick={() => void save("mood", { mood: draft.mood === m ? null : m })}>
                  {MOOD_LABELS[m]}
                </Chip>
              ))}
            </div>
          </Section>

          <Section
            id="flow"
            title="Period flow"
            icon="droplet"
            status={status.flow}
            canClear={draft.flow !== null}
            onClear={() => void save("flow", { flow: null })}
          >
            <div className="chips">
              {FLOWS.map((f) => (
                <Chip key={f} tone="rose" pressed={draft.flow === f} onClick={() => void save("flow", { flow: draft.flow === f ? null : f })}>
                  {FLOW_LABELS[f]}
                </Chip>
              ))}
            </div>
            <p className="tiny">Recording flow marks this day on your calendar. To update cycle estimates, also log the day your period started.</p>
          </Section>

          <Section
            id="symptoms"
            title="Symptoms"
            icon="activity"
            status={status.symptoms}
            canClear={draft.symptoms.length > 0}
            onClear={() => void save("symptoms", { symptoms: [] })}
          >
            <div className="chips">
              {SYMPTOMS.map((s) => (
                <Chip key={s} tone="sage" pressed={draft.symptoms.some((x) => x.name === s)} onClick={() => toggleSymptom(s)}>
                  {SYMPTOM_LABELS[s]}
                </Chip>
              ))}
            </div>
            {draft.symptoms.length > 0 && (
              <div className="stack" style={{ marginTop: 4 }}>
                {draft.symptoms.map((s) => (
                  <div key={s.name} className="stack" style={{ gap: 6 }}>
                    <span className="small" style={{ fontWeight: 600 }}>
                      {SYMPTOM_LABELS[s.name]}
                    </span>
                    <Segmented
                      label={`${SYMPTOM_LABELS[s.name]} severity`}
                      value={s.severity}
                      options={([1, 2, 3] as Severity[]).map((v) => ({ value: v, label: SEVERITY_LABELS[v] }))}
                      onChange={(v) => setSeverity(s.name, v)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            id="energy"
            title="Energy"
            icon="zap"
            status={status.energy}
            canClear={draft.energy !== null}
            onClear={() => void save("energy", { energy: null })}
          >
            <Segmented
              label="Energy level"
              value={draft.energy}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: ENERGY_LABELS[v] ?? String(v) }))}
              onChange={(v) => void save("energy", { energy: v })}
            />
          </Section>

          <Section
            id="sleep"
            title="Sleep"
            icon="moon"
            status={status.sleep}
            canClear={draft.sleepHours !== null || draft.sleepQuality !== null}
            onClear={() => void save("sleep", { sleepHours: null, sleepQuality: null })}
          >
            <span className="small muted">Hours slept</span>
            <ValueStepper
              label="Hours slept"
              value={draft.sleepHours}
              min={0}
              max={16}
              step={0.5}
              initial={7}
              format={(v) => `${v} h`}
              onChange={(v) => void save("sleep", { sleepHours: v })}
            />
            <span className="small muted">Sleep quality</span>
            <Segmented
              label="Sleep quality"
              value={draft.sleepQuality}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: SLEEP_QUALITY_LABELS[v] ?? String(v) }))}
              onChange={(v) => void save("sleep", { sleepQuality: v })}
            />
          </Section>

          <Section
            id="hydration"
            title="Hydration"
            icon="droplet"
            status={status.hydration}
            canClear={draft.waterMl !== null}
            onClear={() => void save("hydration", { waterMl: null })}
          >
            <ValueStepper
              label="Glasses of water"
              value={glasses}
              min={0}
              max={40}
              step={1}
              initial={1}
              format={(v) => `${v} of ${waterGoal}`}
              onChange={(v) => void save("hydration", { waterMl: v * GLASS_ML })}
            />
            <div className="water-glasses" aria-hidden="true">
              {Array.from({ length: Math.max(waterGoal, glasses ?? 0) }, (_, i) => (
                <span key={i} className={glasses !== null && i < glasses ? "full" : undefined} />
              ))}
            </div>
            <div className="row-between wrap">
              <span className="tiny">One glass ≈ {GLASS_ML} ml. Daily goal: {waterGoal} glasses.</span>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost"
                  small
                  disabled={waterGoal <= 4 || setPref.isPending}
                  onClick={() => void setPref.mutateAsync({ key: "water_goal_glasses", value: String(waterGoal - 1) }).catch(() => undefined)}
                  aria-label="Lower daily water goal"
                >
                  Goal −
                </Button>
                <Button
                  variant="ghost"
                  small
                  disabled={waterGoal >= 16 || setPref.isPending}
                  onClick={() => void setPref.mutateAsync({ key: "water_goal_glasses", value: String(waterGoal + 1) }).catch(() => undefined)}
                  aria-label="Raise daily water goal"
                >
                  Goal +
                </Button>
              </div>
            </div>
            {setPref.isError && <Banner tone="error">Couldn't save your water goal.</Banner>}
          </Section>

          <Section id="notes" title="Notes" icon="edit" status={status.notes}>
            <label className="sr-only" htmlFor="day-notes">
              Notes for this day
            </label>
            <textarea
              id="day-notes"
              className="textarea"
              maxLength={2000}
              placeholder="Anything else you want to remember about today. Stays on this phone."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="row-between">
              <span className="tiny">{notes.length}/2000</span>
              <Button
                small
                variant="secondary"
                disabled={(notes.trim() || null) === (day.data?.notes ?? null) || saveDay.isPending}
                onClick={() => void save("notes", { notes: notes.trim() || null })}
              >
                Save note
              </Button>
            </div>
          </Section>

          {hasAnything && (
            <div className="stack">
              <Button variant="danger" block onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={18} /> Delete this day's entries
              </Button>
              <SaveStatus state={status.day.state} error={status.day.error} />
            </div>
          )}
        </>
      )}

      {confirmDelete && (
        <Dialog title="Delete this day?" onClose={() => setConfirmDelete(false)}>
          <p className="muted">
            This removes the mood, flow, symptoms, energy, sleep, hydration, notes and checklist for{" "}
            {formatDate(date, { weekday: "long", day: "numeric", month: "long" })} from this phone. Logged period starts
            are kept.
          </p>
          <div className="stack">
            <Button
              variant="danger-solid"
              block
              loading={deleteDay.isPending}
              onClick={async () => {
                const ok = await status.day.track(deleteDay.mutateAsync(date).then(() => true));
                if (ok) setConfirmDelete(false);
              }}
            >
              Delete
            </Button>
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
          {status.day.state === "error" && <Banner tone="error">{status.day.error}</Banner>}
        </Dialog>
      )}
    </main>
  );
}
