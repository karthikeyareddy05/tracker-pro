import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "../auth/AuthProvider";
import { Banner, Button, LoadingBlock, Stepper, TextField } from "../components/ui";
import { useCycleProfile, useSaveCycleProfile } from "../hooks/health";
import { useToday } from "../hooks/useToday";
import {
  CYCLE_LENGTH_MAX,
  CYCLE_LENGTH_MIN,
  PERIOD_LENGTH_MAX,
  PERIOD_LENGTH_MIN,
  validateCycleInput,
} from "../lib/cycle";
import { addDays, compareDates, isDateStr } from "../lib/dates";
import { BrandMark } from "../components/Icon";

export default function SetupPage() {
  const user = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get("edit") === "1";
  const todayStr = useToday();
  const existing = useCycleProfile();
  const save = useSaveCycleProfile();

  const [cycleLength, setCycleLength] = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [lastStart, setLastStart] = useState("");
  const [unknownDate, setUnknownDate] = useState(false);
  const [errors, setErrors] = useState<{ cycle?: string; period?: string; date?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefilled || !existing.isSuccess) return;
    if (existing.data) {
      setCycleLength(existing.data.cycleLength);
      setPeriodLength(existing.data.periodLength);
      setLastStart(existing.data.lastPeriodStart ?? "");
      setUnknownDate(existing.data.lastPeriodStart === null);
    }
    setPrefilled(true);
  }, [existing.isSuccess, existing.data, prefilled]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: typeof errors = {};
    if (!Number.isInteger(cycleLength) || cycleLength < CYCLE_LENGTH_MIN || cycleLength > CYCLE_LENGTH_MAX) {
      next.cycle = `Enter a cycle length between ${CYCLE_LENGTH_MIN} and ${CYCLE_LENGTH_MAX} days.`;
    }
    if (!Number.isInteger(periodLength) || periodLength < PERIOD_LENGTH_MIN || periodLength > PERIOD_LENGTH_MAX) {
      next.period = `Enter a period length between ${PERIOD_LENGTH_MIN} and ${PERIOD_LENGTH_MAX} days.`;
    }
    if (!next.cycle && !next.period) {
      const combined = validateCycleInput(cycleLength, periodLength);
      if (combined) next.period = combined;
    }
    let lastPeriodStart: string | null = null;
    if (!unknownDate) {
      if (!lastStart || !isDateStr(lastStart)) next.date = "Choose the first day of your most recent period, or tick “I'm not sure”.";
      else if (compareDates(lastStart, todayStr) > 0) next.date = "This date can't be in the future.";
      else lastPeriodStart = lastStart;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await save.mutateAsync({ cycleLength, periodLength, lastPeriodStart });
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't save your setup. Please try again.");
    }
  }

  if (existing.isPending) return <LoadingBlock />;

  const firstName = user.displayName.split(" ")[0] || "there";

  return (
    <main className="auth-layout">
      <div className="auth-inner">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Tracker Pro</span>
        </div>
        <div>
          <p className="eyebrow">{editing || existing.data ? "Cycle setup" : "Step 1 of 1"}</p>
          <h1>{editing || existing.data ? "Update your cycle" : `Welcome, ${firstName}`}</h1>
          <p className="lede">
            A few details help Tracker Pro estimate your cycle. Typical lengths vary from person to person and month to
            month — your best guess is fine, and you can change it any time.
          </p>
        </div>
        <form className="card form" onSubmit={onSubmit} noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}
          <Stepper
            label="Typical cycle length"
            value={cycleLength}
            min={CYCLE_LENGTH_MIN}
            max={CYCLE_LENGTH_MAX}
            onChange={setCycleLength}
            unit="days"
            error={errors.cycle}
          />
          <Stepper
            label="Typical period length"
            value={periodLength}
            min={PERIOD_LENGTH_MIN}
            max={PERIOD_LENGTH_MAX}
            onChange={setPeriodLength}
            unit="days"
            error={errors.period}
          />
          <TextField
            label="First day of your most recent period"
            type="date"
            value={lastStart}
            max={todayStr}
            min={addDays(todayStr, -365)}
            onChange={(e) => setLastStart(e.target.value)}
            disabled={unknownDate}
            error={errors.date}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={unknownDate}
              onChange={(e) => {
                setUnknownDate(e.target.checked);
                if (e.target.checked) setErrors((er) => ({ ...er, date: undefined }));
              }}
            />
            <span>I'm not sure. Skip cycle estimates for now — I can still track mood, symptoms, sleep and more.</span>
          </label>
          <p className="disclaimer">
            Estimates are calculated from these numbers only. They aren't medical predictions and can't be used for
            contraception or to confirm pregnancy.
          </p>
          <Button type="submit" block loading={save.isPending}>
            {save.isPending ? "Saving…" : editing || existing.data ? "Save changes" : "Save and continue"}
          </Button>
          {(editing || existing.data) && (
            <Button variant="ghost" block onClick={() => navigate(-1)} disabled={save.isPending}>
              Cancel
            </Button>
          )}
        </form>
      </div>
    </main>
  );
}
