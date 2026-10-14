import { addDays, compareDates, rangeDates, type DateStr } from "./dates";
import { MOODS, SYMPTOMS, type DayEntry, type Mood, type SymptomName } from "../storage/healthStore";
import { ENERGY_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from "./labels";

/** Number of tracked categories recorded on a day (mood, flow, symptoms, energy, sleep, water). */
export function categoriesLogged(e: DayEntry | undefined): number {
  if (!e) return 0;
  return [
    e.mood !== null,
    e.flow !== null,
    e.symptoms.length > 0,
    e.energy !== null,
    e.sleepHours !== null || e.sleepQuality !== null,
    e.waterMl !== null,
  ].filter(Boolean).length;
}

export const CATEGORY_COUNT = 6;

export function isLogged(e: DayEntry | undefined): boolean {
  return !!e && (categoriesLogged(e) > 0 || !!e.notes);
}

export interface Summary {
  week: { date: DateStr; categories: number }[];
  loggedDays30: number;
  consistencyPct: number;
  streak: number;
  moodCounts: { mood: Mood; count: number }[];
  symptomCounts: { name: SymptomName; count: number }[];
  avgSleep: number | null;
  avgEnergy: number | null;
  avgGlasses: number | null;
  sleepSamples: number;
  energySamples: number;
  waterSamples: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Aggregates entries from the last 30 days (inclusive of today). */
export function summarize(entries: DayEntry[], today: DateStr, glassMl: number): Summary {
  const from30 = addDays(today, -29);
  const recent = entries.filter((e) => compareDates(e.date, from30) >= 0 && compareDates(e.date, today) <= 0);
  const byDate = new Map(recent.map((e) => [e.date, e]));

  const week = rangeDates(addDays(today, -6), today).map((date) => ({ date, categories: categoriesLogged(byDate.get(date)) }));
  const loggedDays30 = recent.filter(isLogged).length;

  // Streak counts back from today, or from yesterday if today isn't logged yet.
  let streak = 0;
  let cursor = isLogged(byDate.get(today)) ? today : addDays(today, -1);
  while (isLogged(byDate.get(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const moodCounts = MOODS.map((mood) => ({ mood, count: recent.filter((e) => e.mood === mood).length })).filter(
    (m) => m.count > 0,
  );
  const symptomCounts = SYMPTOMS.map((name) => ({
    name,
    count: recent.filter((e) => e.symptoms.some((s) => s.name === name)).length,
  }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const sleep = recent.map((e) => e.sleepHours).filter((v): v is number => v !== null);
  const energy = recent.map((e) => e.energy).filter((v): v is number => v !== null);
  const water = recent.map((e) => e.waterMl).filter((v): v is number => v !== null);

  return {
    week,
    loggedDays30,
    consistencyPct: Math.round((loggedDays30 / 30) * 100),
    streak,
    moodCounts,
    symptomCounts,
    avgSleep: sleep.length >= 3 ? Math.round(avg(sleep)! * 10) / 10 : null,
    avgEnergy: energy.length >= 3 ? Math.round(avg(energy)! * 10) / 10 : null,
    avgGlasses: water.length >= 3 ? Math.round((avg(water)! / glassMl) * 10) / 10 : null,
    sleepSamples: sleep.length,
    energySamples: energy.length,
    waterSamples: water.length,
  };
}

/**
 * Plain-language observations about the user's own logs. Each requires a
 * minimum number of data points and is phrased as an observation, not advice.
 */
export function observations(entries: DayEntry[]): string[] {
  const out: string[] = [];

  // Sleep vs next-recorded energy on the same day.
  const paired = entries.filter((e) => e.sleepHours !== null && e.energy !== null);
  const short = paired.filter((e) => e.sleepHours! < 7);
  const rested = paired.filter((e) => e.sleepHours! >= 7);
  if (short.length >= 3 && rested.length >= 3) {
    const a = avg(short.map((e) => e.energy!))!;
    const b = avg(rested.map((e) => e.energy!))!;
    if (Math.abs(a - b) >= 0.5) {
      const label = (v: number) => ENERGY_LABELS[Math.round(v)]?.toLowerCase() ?? v.toFixed(1);
      out.push(
        `On days you logged under 7 hours of sleep, your energy averaged “${label(a)}” (${a.toFixed(1)}/5), compared with “${label(b)}” (${b.toFixed(1)}/5) after 7 hours or more.`,
      );
    }
  }

  // Symptoms on days with recorded flow.
  const flowDays = entries.filter((e) => e.flow && e.flow !== "none");
  if (flowDays.length >= 3) {
    const counts = SYMPTOMS.map((name) => ({
      name,
      count: flowDays.filter((e) => e.symptoms.some((s) => s.name === name)).length,
    })).sort((x, y) => y.count - x.count);
    const top = counts[0];
    if (top && top.count >= 2) {
      out.push(`${SYMPTOM_LABELS[top.name]} was logged on ${top.count} of the ${flowDays.length} days you recorded period flow.`);
    }
  }

  // Most frequent mood.
  const moods = entries.filter((e) => e.mood !== null);
  if (moods.length >= 5) {
    const counts = MOODS.map((m) => ({ m, n: moods.filter((e) => e.mood === m).length })).sort((x, y) => y.n - x.n);
    const top = counts[0]!;
    out.push(`“${MOOD_LABELS[top.m]}” was your most-logged mood (${top.n} of ${moods.length} mood check-ins).`);
  }

  return out;
}
