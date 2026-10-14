import { addDays, compareDates, diffDays, type DateStr } from "./dates";

/**
 * Cycle estimates. Everything here is an arithmetic projection from the user's
 * own typical lengths and logged dates — never a medical prediction.
 */

export const CYCLE_LENGTH_MIN = 15;
export const CYCLE_LENGTH_MAX = 90;
export const PERIOD_LENGTH_MIN = 1;
export const PERIOD_LENGTH_MAX = 15;

export interface CycleProfile {
  cycleLength: number;
  periodLength: number;
  /** First day of the most recent period, if the user provided one. */
  lastPeriodStart: DateStr | null;
  completedAt: string;
  updatedAt: string;
}

export interface CycleStatus {
  /** The period start all estimates are anchored to. */
  anchor: DateStr;
  anchorSource: "logged" | "setup";
  /** 1-based day within the estimated current cycle. */
  cycleDay: number;
  /** True when today falls within the estimated period days. */
  inEstimatedPeriod: boolean;
  nextPeriodStart: DateStr;
  daysUntilNextPeriod: number;
  /** True when the anchor is more than two cycles old, so estimates are less reliable. */
  stale: boolean;
}

export function validateCycleInput(cycleLength: number, periodLength: number): string | null {
  if (!Number.isInteger(cycleLength) || cycleLength < CYCLE_LENGTH_MIN || cycleLength > CYCLE_LENGTH_MAX) {
    return `Cycle length must be a whole number between ${CYCLE_LENGTH_MIN} and ${CYCLE_LENGTH_MAX} days.`;
  }
  if (!Number.isInteger(periodLength) || periodLength < PERIOD_LENGTH_MIN || periodLength > PERIOD_LENGTH_MAX) {
    return `Period length must be a whole number between ${PERIOD_LENGTH_MIN} and ${PERIOD_LENGTH_MAX} days.`;
  }
  if (periodLength > cycleLength) {
    return "Period length can't be longer than cycle length.";
  }
  return null;
}

/** Most recent known period start not after `today`, from logs or setup. */
export function latestAnchor(
  profile: CycleProfile | null,
  loggedStarts: DateStr[],
  today: DateStr,
): { date: DateStr; source: "logged" | "setup" } | null {
  let best: { date: DateStr; source: "logged" | "setup" } | null = null;
  for (const d of loggedStarts) {
    if (compareDates(d, today) <= 0 && (!best || compareDates(d, best.date) > 0)) best = { date: d, source: "logged" };
  }
  const setup = profile?.lastPeriodStart;
  if (setup && compareDates(setup, today) <= 0 && (!best || compareDates(setup, best.date) > 0)) {
    best = { date: setup, source: "setup" };
  }
  return best;
}

export function computeCycleStatus(
  profile: CycleProfile | null,
  loggedStarts: DateStr[],
  today: DateStr,
): CycleStatus | null {
  if (!profile) return null;
  const anchor = latestAnchor(profile, loggedStarts, today);
  if (!anchor) return null;
  const { cycleLength, periodLength } = profile;
  const elapsed = diffDays(today, anchor.date);
  const cyclesPassed = Math.floor(elapsed / cycleLength);
  const cycleDay = (elapsed % cycleLength) + 1;
  const nextPeriodStart = addDays(anchor.date, (cyclesPassed + 1) * cycleLength);
  return {
    anchor: anchor.date,
    anchorSource: anchor.source,
    cycleDay,
    inEstimatedPeriod: cycleDay <= periodLength,
    nextPeriodStart,
    daysUntilNextPeriod: diffDays(nextPeriodStart, today),
    stale: elapsed >= cycleLength * 2,
  };
}

/**
 * Estimated period days between `from` and `to` (inclusive), projected forward
 * from the anchor. Days before the anchor are not estimated.
 */
export function estimatedPeriodDays(
  profile: CycleProfile,
  anchor: DateStr,
  from: DateStr,
  to: DateStr,
): Set<DateStr> {
  const result = new Set<DateStr>();
  const { cycleLength, periodLength } = profile;
  const startOffset = Math.max(0, Math.floor(diffDays(from, anchor) / cycleLength) - 1);
  for (let k = startOffset; ; k++) {
    const start = addDays(anchor, k * cycleLength);
    if (compareDates(start, to) > 0) break;
    for (let i = 0; i < periodLength; i++) {
      const d = addDays(start, i);
      if (compareDates(d, from) >= 0 && compareDates(d, to) <= 0) result.add(d);
    }
    if (k > 10_000) break; // safety
  }
  return result;
}

/** Average gap between consecutive logged period starts (needs at least two). */
export function loggedCycleStats(starts: DateStr[]): { average: number; shortest: number; longest: number; count: number } | null {
  const sorted = [...new Set(starts)].sort(compareDates);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = diffDays(sorted[i]!, sorted[i - 1]!);
    // Ignore gaps that can't be a single cycle (likely a missed log).
    if (gap >= CYCLE_LENGTH_MIN && gap <= CYCLE_LENGTH_MAX) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  const average = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  return { average, shortest: Math.min(...gaps), longest: Math.max(...gaps), count: gaps.length };
}
