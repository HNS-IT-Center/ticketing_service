/**
 * Libur tetap (owner, 2026-11-19, from the Data Accurate "Jadwal & Libur"
 * brief, part A only): each technician's weekly days off and a fixed
 * replacement who covers them. The days off are the complement of the
 * technician's `work_days`, which every other schedule figure already reads,
 * so nothing has two sources. Pure: days are "YYYY-MM-DD" (WIB), weekdays the
 * stored keys "Mon" … "Sun".
 */

export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEK)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  Mon: "Senin",
  Tue: "Selasa",
  Wed: "Rabu",
  Thu: "Kamis",
  Fri: "Jumat",
  Sat: "Sabtu",
  Sun: "Minggu",
};
export const WEEKDAY_SHORT: Record<Weekday, string> = { Mon: "Sen", Tue: "Sel", Wed: "Rab", Thu: "Kam", Fri: "Jum", Sat: "Sab", Sun: "Min" };

/** At most this many days off a week (the brief's rule). */
export const MAX_DAYS_OFF = 3;
export const NOTE_MAX = 500;

export function isWeekday(v: string): v is Weekday {
  return (WEEK as readonly string[]).includes(v);
}

/** A stored `work_days` value, made safe: known keys, once each, in week order. Null when not set. */
export function readWorkDays(value: unknown): Weekday[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const set = new Set(value.filter((v): v is string => typeof v === "string"));
  return WEEK.filter((d) => set.has(d));
}

/** The days off a weekly pattern leaves. Null when the pattern is not set. */
export function daysOffOf(workDays: readonly Weekday[] | null): Weekday[] | null {
  return workDays ? WEEK.filter((d) => !workDays.includes(d)) : null;
}

/** The pattern that a set of days off leaves. */
export function workDaysFrom(daysOff: readonly Weekday[]): Weekday[] {
  return WEEK.filter((d) => !daysOff.includes(d));
}

/** "Sabtu & Minggu", "Senin, Rabu & Jumat". */
export function listDays(days: readonly Weekday[]): string {
  const names = days.map((d) => WEEKDAY_LABELS[d]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** The weekday of a WIB day key. */
export function weekdayOf(day: string): Weekday {
  return WEEK[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];
}

export type DayOffInput = { daysOff: string[]; replacementId: string | null; note: string };

/** What is wrong with a rule before it is saved, or null. */
export function dayOffProblem(technicianId: string, input: DayOffInput): string | null {
  const days = new Set(input.daysOff);
  if ([...days].some((d) => !isWeekday(d))) return "Hari libur tidak dikenal.";
  if (days.size === 0) return "Pilih minimal satu hari libur.";
  if (days.size > MAX_DAYS_OFF) return `Maksimal ${MAX_DAYS_OFF} hari libur dalam seminggu.`;
  if (input.note.length > NOTE_MAX) return `Catatan maksimal ${NOTE_MAX} karakter.`;
  if (input.replacementId === technicianId) return "Pengganti tidak boleh orang yang sama.";
  return null;
}

/** Days both the technician and the replacement are off: the days nobody covers. */
export function clashDays(daysOff: readonly Weekday[], replacementDaysOff: readonly Weekday[] | null): Weekday[] {
  return replacementDaysOff ? daysOff.filter((d) => replacementDaysOff.includes(d)) : [];
}

/** How many of these technicians are off on each weekday, so days off do not pile up. */
export function spread(patterns: readonly (readonly Weekday[] | null)[]): Record<Weekday, number> {
  const out = Object.fromEntries(WEEK.map((d) => [d, 0])) as Record<Weekday, number>;
  for (const p of patterns) for (const d of daysOffOf(p) ?? []) out[d]++;
  return out;
}

// ── Effect on the monthly target ───────────────────────────────────────────

/** Every day of a month ("YYYY-MM"), as WIB day keys. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * How much of a month's target still applies after leave (owner, 2026-11-19:
 * "cuti mengurangi target"). Days off are not working days to begin with; a
 * day of leave on a working day takes its share off. A technician whose
 * pattern is not set keeps the whole target — there is nothing to measure
 * leave against.
 */
export function leaveFactor(workDays: readonly Weekday[] | null, leaveDays: readonly string[], month: string): { scheduled: number; leave: number; factor: number } {
  if (!workDays || workDays.length === 0) return { scheduled: 0, leave: 0, factor: 1 };
  const scheduled = daysOfMonth(month).filter((d) => workDays.includes(weekdayOf(d)));
  const onLeave = new Set(leaveDays.filter((d) => d.startsWith(`${month}-`)));
  const leave = scheduled.filter((d) => onLeave.has(d)).length;
  return { scheduled: scheduled.length, leave, factor: scheduled.length ? (scheduled.length - leave) / scheduled.length : 1 };
}

// ── Who covers whom today ──────────────────────────────────────────────────

export type CoverRule = { technicianId: string; technicianName: string; replacementId: string; workDays: readonly Weekday[] | null };

/** The colleagues `userId` covers on `day`: their fixed replacement, on one of their days off. */
export function coveringOn(userId: string, day: string, rules: readonly CoverRule[]): CoverRule[] {
  const weekday = weekdayOf(day);
  return rules.filter((r) => r.replacementId === userId && (daysOffOf(r.workDays) ?? []).includes(weekday));
}
