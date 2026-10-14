/**
 * Calendar dates are handled as "YYYY-MM-DD" strings in the user's local calendar.
 * Arithmetic is done on UTC midnights so daylight-saving changes and timezones
 * never shift a date, and leap years come from the platform calendar.
 */
export type DateStr = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toUtcMs(date: DateStr): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): DateStr {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Today's date in the device's local timezone. */
export function today(now: Date = new Date()): DateStr {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: DateStr, from: DateStr): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthKey(date: DateStr): string {
  return date.slice(0, 7);
}

export function firstOfMonth(year: number, monthIndex: number): DateStr {
  return fromUtcMs(Date.UTC(year, monthIndex, 1));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

export function parts(date: DateStr): { year: number; monthIndex: number; day: number } {
  const ms = toUtcMs(date);
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth(), day: d.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateStr): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/**
 * 6×7 grid of dates for a month view, weeks starting on Monday.
 * Days outside the month are included so every row is complete.
 */
export function monthGrid(year: number, monthIndex: number): DateStr[] {
  const first = firstOfMonth(year, monthIndex);
  const offset = (weekday(first) + 6) % 7; // Monday-first
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function rangeDates(from: DateStr, to: DateStr): DateStr[] {
  const n = diffDays(to, from);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatDate(date: DateStr, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return formatter(options).format(new Date(toUtcMs(date)));
}

export function formatLong(date: DateStr): string {
  return formatDate(date, { weekday: "long", day: "numeric", month: "long" });
}

export function formatMonthYear(year: number, monthIndex: number): string {
  return formatter({ month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function weekdayLabels(): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays("2024-01-01", i), { weekday: "narrow" }));
}

export function relativeDayLabel(date: DateStr, reference: DateStr): string {
  const d = diffDays(date, reference);
  if (d === 0) return "Today";
  if (d === -1) return "Yesterday";
  if (d === 1) return "Tomorrow";
  return formatDate(date, { weekday: "short", day: "numeric", month: "short" });
}
