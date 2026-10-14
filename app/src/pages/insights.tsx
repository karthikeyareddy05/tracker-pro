import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Banner, EmptyState, LoadingBlock } from "../components/ui";
import { useCycleProfile, useDays, usePeriodStarts } from "../hooks/health";
import { useToday } from "../hooks/useToday";
import { computeCycleStatus, loggedCycleStats } from "../lib/cycle";
import { addDays, formatDate } from "../lib/dates";
import { CATEGORY_COUNT, observations, summarize } from "../lib/insights";
import { ENERGY_LABELS, GLASS_ML, MOOD_LABELS, plural, SYMPTOM_LABELS } from "../lib/labels";

const MIN_DAYS_FOR_INSIGHTS = 3;

function HBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="hbar-list">
      {rows.map((r) => (
        <div className="hbar-row" key={r.label}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <div className="hbar-track" role="presentation">
            <div className="hbar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function CycleSection() {
  const todayStr = useToday();
  const profile = useCycleProfile();
  const starts = usePeriodStarts();
  if (!profile.data || !starts.data) return null;
  const status = computeCycleStatus(profile.data, starts.data, todayStr);
  const stats = loggedCycleStats(starts.data);
  return (
    <section className="card stack" aria-labelledby="cycle-insights">
      <div className="card-header" style={{ marginBottom: 0 }}>
        <h2 id="cycle-insights">Cycle estimates</h2>
        <span className="estimate-tag">Estimate</span>
      </div>
      {status ? (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{formatDate(status.nextPeriodStart)}</div>
            <div className="stat-label">Next period (estimated)</div>
          </div>
          <div className="stat">
            <div className="stat-value">Day {status.cycleDay}</div>
            <div className="stat-label">of a typical {profile.data.cycleLength}-day cycle</div>
          </div>
        </div>
      ) : (
        <p className="muted small">
          Add a period start to see estimates. <Link to="/calendar">Open calendar</Link>
        </p>
      )}
      {stats ? (
        <p className="small">
          Across {plural(stats.count, "logged cycle")}, your cycles averaged <strong>{stats.average} days</strong>
          {stats.count > 1 && (
            <>
              {" "}
              (shortest {stats.shortest}, longest {stats.longest})
            </>
          )}
          . Your setup says {profile.data.cycleLength} days — update it in Profile if your logs differ.
        </p>
      ) : (
        <p className="tiny">Log at least two period starts to compare your actual cycle lengths with your typical length.</p>
      )}
    </section>
  );
}

export default function InsightsPage() {
  const todayStr = useToday();
  const from90 = addDays(todayStr, -89);
  const days = useDays(from90, todayStr);

  if (days.isPending) return <LoadingBlock />;

  const entries = days.data ?? [];
  const summary = summarize(entries, todayStr, GLASS_ML);
  const notes = observations(entries);
  const enough = summary.loggedDays30 >= MIN_DAYS_FOR_INSIGHTS;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Insights</p>
          <h1>Your patterns</h1>
        </div>
      </header>

      {days.isError && <Banner tone="error">Couldn't read your on-device records.</Banner>}

      {!enough ? (
        <section className="card">
          <EmptyState
            icon="insights"
            title="Insights appear after a few check-ins"
            action={
              <Link to="/track" className="btn btn--primary">
                Log today
              </Link>
            }
          >
            You've logged {plural(summary.loggedDays30, "day")} in the last 30 days. After {MIN_DAYS_FOR_INSIGHTS}, you'll
            see summaries built only from what you've recorded.
          </EmptyState>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="week-title">
            <div className="card-header">
              <h2 id="week-title">Last 7 days</h2>
              <span className="tiny">categories logged per day</span>
            </div>
            <div className="bars" role="img" aria-label={summary.week.map((w) => `${formatDate(w.date, { weekday: "long" })}: ${w.categories} of ${CATEGORY_COUNT}`).join(", ")}>
              {summary.week.map((w) => (
                <div className="bar-col" key={w.date}>
                  <div
                    className={`bar${w.categories === 0 ? " bar--empty" : ""}`}
                    style={{ height: `${Math.max(3, (w.categories / CATEGORY_COUNT) * 100)}%` }}
                  />
                  <span className="bar-label">{formatDate(w.date, { weekday: "narrow" })}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="stat-grid" aria-label="Tracking consistency">
            <div className="stat">
              <div className="stat-value">{summary.consistencyPct}%</div>
              <div className="stat-label">Days logged (last 30)</div>
            </div>
            <div className="stat">
              <div className="stat-value">{summary.streak}</div>
              <div className="stat-label">Day streak</div>
            </div>
            {summary.avgSleep !== null && (
              <div className="stat">
                <div className="stat-value">{summary.avgSleep} h</div>
                <div className="stat-label">Avg sleep ({summary.sleepSamples} nights)</div>
              </div>
            )}
            {summary.avgEnergy !== null && (
              <div className="stat">
                <div className="stat-value">{ENERGY_LABELS[Math.round(summary.avgEnergy)]}</div>
                <div className="stat-label">Typical energy ({summary.avgEnergy}/5)</div>
              </div>
            )}
            {summary.avgGlasses !== null && (
              <div className="stat">
                <div className="stat-value">{summary.avgGlasses}</div>
                <div className="stat-label">Avg glasses of water</div>
              </div>
            )}
          </section>

          {summary.moodCounts.length > 0 && (
            <section className="card" aria-labelledby="mood-dist">
              <div className="card-header">
                <h2 id="mood-dist">Mood, last 30 days</h2>
              </div>
              <HBars rows={summary.moodCounts.map((m) => ({ label: MOOD_LABELS[m.mood], count: m.count }))} />
            </section>
          )}

          {summary.symptomCounts.length > 0 && (
            <section className="card" aria-labelledby="symptom-dist">
              <div className="card-header">
                <h2 id="symptom-dist">Symptoms, last 30 days</h2>
                <span className="tiny">days logged</span>
              </div>
              <HBars rows={summary.symptomCounts.slice(0, 6).map((s) => ({ label: SYMPTOM_LABELS[s.name], count: s.count }))} />
            </section>
          )}

          <section className="card" aria-labelledby="patterns">
            <div className="card-header">
              <h2 id="patterns">Personal patterns</h2>
            </div>
            {notes.length > 0 ? (
              <div>
                {notes.map((n) => (
                  <p className="observation" key={n}>
                    <Icon name="sparkle" size={16} />
                    <span>{n}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="muted small">
                Not enough data for patterns yet. Keep logging sleep, energy and symptoms — patterns need several days of
                each.
              </p>
            )}
          </section>
        </>
      )}

      <CycleSection />

      <p className="disclaimer">
        These are observations from your own entries over the last 90 days, not medical conclusions. Patterns can be
        coincidence. For health concerns, please talk to a healthcare professional.
      </p>
    </main>
  );
}
