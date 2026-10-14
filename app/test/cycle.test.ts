import { describe, expect, it } from "vitest";
import {
  computeCycleStatus,
  estimatedPeriodDays,
  latestAnchor,
  loggedCycleStats,
  validateCycleInput,
  type CycleProfile,
} from "../src/lib/cycle";
import { addDays, diffDays, isDateStr, monthGrid, rangeDates, today } from "../src/lib/dates";
import { observations, summarize } from "../src/lib/insights";
import { EMPTY_FIELDS, type DayEntry } from "../src/storage/healthStore";

const profile = (over: Partial<CycleProfile> = {}): CycleProfile => ({
  cycleLength: 28,
  periodLength: 5,
  lastPeriodStart: "2026-03-01",
  completedAt: "x",
  updatedAt: "x",
  ...over,
});

describe("dates", () => {
  it("handles month boundaries and leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-03-01", "2026-02-01")).toBe(28);
    expect(diffDays("2024-03-01", "2024-02-01")).toBe(29);
  });

  it("is unaffected by daylight-saving transitions", () => {
    // Spans US and EU DST changes; whole-day arithmetic must stay exact.
    expect(diffDays("2026-11-02", "2026-03-01")).toBe(246);
    expect(rangeDates("2026-03-28", "2026-03-31")).toHaveLength(4);
  });

  it("validates calendar dates", () => {
    expect(isDateStr("2024-02-29")).toBe(true);
    expect(isDateStr("2025-02-29")).toBe(false);
    expect(isDateStr("2026-13-01")).toBe(false);
    expect(isDateStr("26-1-1")).toBe(false);
  });

  it("uses the local calendar date for today", () => {
    const late = new Date(2026, 2, 15, 23, 59);
    expect(today(late)).toBe("2026-03-15");
  });

  it("builds a Monday-first 6-week grid", () => {
    const grid = monthGrid(2026, 1); // February 2026 starts on a Sunday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-01-26");
    expect(grid[6]).toBe("2026-02-01");
  });
});

describe("cycle estimates", () => {
  it("validates lengths", () => {
    expect(validateCycleInput(15, 1)).toBeNull();
    expect(validateCycleInput(90, 15)).toBeNull();
    expect(validateCycleInput(14, 5)).toMatch(/15 and 90/);
    expect(validateCycleInput(28, 16)).toMatch(/1 and 15/);
    expect(validateCycleInput(28.5, 5)).toMatch(/whole number/);
  });

  it("computes cycle day and next period", () => {
    const s = computeCycleStatus(profile(), [], "2026-03-10")!;
    expect(s.cycleDay).toBe(10);
    expect(s.nextPeriodStart).toBe("2026-03-29");
    expect(s.daysUntilNextPeriod).toBe(19);
    expect(s.inEstimatedPeriod).toBe(false);
    expect(s.anchorSource).toBe("setup");
  });

  it("projects forward when several cycles have passed and flags staleness", () => {
    const s = computeCycleStatus(profile(), [], "2026-05-01")!;
    // 61 days elapsed: 2 full cycles (56) → day 6 of the third.
    expect(s.cycleDay).toBe(6);
    expect(s.nextPeriodStart).toBe("2026-05-24");
    expect(s.stale).toBe(true);
  });

  it("prefers the most recent logged start", () => {
    const s = computeCycleStatus(profile(), ["2026-03-27"], "2026-03-29")!;
    expect(s.anchor).toBe("2026-03-27");
    expect(s.anchorSource).toBe("logged");
    expect(s.cycleDay).toBe(3);
    expect(s.inEstimatedPeriod).toBe(true);
  });

  it("returns null without a profile or any start date", () => {
    expect(computeCycleStatus(null, [], "2026-03-10")).toBeNull();
    expect(computeCycleStatus(profile({ lastPeriodStart: null }), [], "2026-03-10")).toBeNull();
  });

  it("ignores future dates as anchors", () => {
    expect(latestAnchor(profile({ lastPeriodStart: null }), ["2026-04-01"], "2026-03-10")).toBeNull();
  });

  it("estimates period windows across month boundaries", () => {
    const days = estimatedPeriodDays(profile(), "2026-03-01", "2026-03-25", "2026-04-05");
    expect([...days].sort()).toEqual(["2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]);
  });

  it("summarizes logged cycle lengths and ignores implausible gaps", () => {
    expect(loggedCycleStats(["2026-01-01"])).toBeNull();
    expect(loggedCycleStats(["2026-01-01", "2026-01-29", "2026-02-28", "2026-07-01"])).toEqual({
      average: 29,
      shortest: 28,
      longest: 30,
      count: 2,
    });
  });
});

const entry = (date: string, over: Partial<DayEntry> = {}): DayEntry => ({
  date,
  ...EMPTY_FIELDS,
  symptoms: [],
  updatedAt: null,
  ...over,
});

describe("insights", () => {
  it("summarizes only real entries", () => {
    const t = "2026-03-15";
    const s = summarize(
      [
        entry("2026-03-15", { mood: "good", sleepHours: 8, energy: 4 }),
        entry("2026-03-14", { mood: "good", sleepHours: 6, energy: 2, waterMl: 2000 }),
        entry("2026-03-13", { mood: "low", sleepHours: 7, energy: 3, symptoms: [{ name: "cramps", severity: 2 }] }),
        entry("2026-01-01", { mood: "great" }), // outside 30 days
      ],
      t,
      250,
    );
    expect(s.loggedDays30).toBe(3);
    expect(s.streak).toBe(3);
    expect(s.consistencyPct).toBe(10);
    expect(s.moodCounts).toEqual([
      { mood: "good", count: 2 },
      { mood: "low", count: 1 },
    ]);
    expect(s.avgSleep).toBe(7);
    expect(s.avgGlasses).toBeNull(); // fewer than 3 samples
    expect(s.week.at(-1)).toEqual({ date: t, categories: 3 });
  });

  it("only reports patterns with enough data", () => {
    expect(observations([entry("2026-03-01", { sleepHours: 5, energy: 1 })])).toEqual([]);
    const many = [
      ...[1, 2, 3].map((d) => entry(`2026-03-0${d}`, { sleepHours: 5, energy: 1 })),
      ...[4, 5, 6].map((d) => entry(`2026-03-0${d}`, { sleepHours: 8, energy: 4 })),
    ];
    expect(observations(many)[0]).toMatch(/under 7 hours/);
  });
});
