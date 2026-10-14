import type { Flow, Mood, SymptomName } from "../storage/healthStore";

export const MOOD_LABELS: Record<Mood, string> = {
  great: "Great",
  good: "Good",
  okay: "Okay",
  low: "Low",
  anxious: "Anxious",
  irritable: "Irritable",
};

export const FLOW_LABELS: Record<Flow, string> = {
  none: "None",
  spotting: "Spotting",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

export const SYMPTOM_LABELS: Record<SymptomName, string> = {
  cramps: "Cramps",
  headache: "Headache",
  bloating: "Bloating",
  back_pain: "Back pain",
  breast_tenderness: "Breast tenderness",
  acne: "Acne",
  fatigue: "Fatigue",
  nausea: "Nausea",
  cravings: "Cravings",
  mood_swings: "Mood swings",
};

export const SEVERITY_LABELS = { 1: "Mild", 2: "Moderate", 3: "Severe" } as const;

export const ENERGY_LABELS: Record<number, string> = {
  1: "Drained",
  2: "Low",
  3: "Steady",
  4: "Good",
  5: "Energised",
};

export const SLEEP_QUALITY_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Restless",
  3: "Okay",
  4: "Good",
  5: "Great",
};

export const GLASS_ML = 250;
export const DEFAULT_WATER_GOAL_GLASSES = 8;

export function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
