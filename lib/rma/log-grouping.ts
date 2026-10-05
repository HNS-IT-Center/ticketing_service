/**
 * Shaping the RMA activity log for reading.
 *
 * The log page used to render every RmaEvent as one flat, newest-first list.
 * With 24 events across 9 cases that put a single case's story in pieces all
 * over the page: RMA-NGH-2610-0001's two events sat four rows apart, separated
 * by events belonging to two other cases. Grouping — by case, or by calendar
 * day — is what makes it readable, and the grouping key is the only thing here
 * that is subtle, because it has to be the shop's day and not the server's.
 *
 * Everything in this module is pure. The clock arrives as an argument, so a
 * component never reads it: see the same note in lib/rma/queue.ts.
 */

/** The shop is in Batam. `formatDateTime` in lib/utils.ts already assumes it. */
export const LOG_TIME_ZONE = "Asia/Jakarta";

/** UTC offset of LOG_TIME_ZONE, as the suffix of an ISO 8601 timestamp. */
const LOG_UTC_OFFSET = "+07:00";

const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: LOG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("id-ID", {
  timeZone: LOG_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: LOG_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The calendar day an instant falls on in the shop's time zone, as YYYY-MM-DD.
 *
 * Not the server's day: an event written at 23:30 in Batam is 16:30 UTC, so a
 * UTC-based key would file it under the day before and split a working evening
 * across two headings.
 */
export function logDayKey(at: Date): string {
  return DAY_KEY_FORMAT.format(at);
}

/** "Jumat, 2 Oktober 2026" — the heading above one day's events. */
export function formatDayLabel(dayKey: string): string {
  // Midnight UTC on that date is 07:00 the same date in Jakarta, so reading it
  // back in the shop's zone cannot land on a neighbouring day.
  return DAY_LABEL_FORMAT.format(new Date(`${dayKey}T00:00:00Z`));
}

/** "18:24" in the shop's time zone. */
export function formatTimeOfDay(at: Date): string {
  return TIME_FORMAT.format(at);
}

/**
 * How long passed between two steps of the same case, in the coarsest unit
 * that still says something: "7 detik", "21 menit", "3 jam", "4 hari".
 *
 * This is the number the old page threw away. Three transitions a few seconds
 * apart and three a week apart read identically when all you see is a date.
 */
export function formatGap(previous: Date, current: Date): string {
  const ms = Math.max(0, current.getTime() - previous.getTime());
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))} detik`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} menit`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} jam`;
  return `${Math.floor(ms / DAY)} hari`;
}

/**
 * How long the case has been sitting where it is now, counted in whole days
 * from the newest event — the same measure the dashboard's deadlines use.
 */
export function formatStageAge(since: Date, now: Date): string {
  const days = Math.floor(Math.max(0, now.getTime() - since.getTime()) / DAY);
  if (days === 0) return "Masuk tahap ini hari ini";
  return `${days} hari di tahap ini`;
}

/** Whole days between two instants, floored, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor(Math.max(0, to.getTime() - from.getTime()) / DAY);
}

/**
 * Turn the two date inputs of the filter into a half-open interval.
 *
 * Both boundaries are built in the shop's time zone. The page this replaced
 * wrote `new Date(\`${date}T00:00:00\`)`, which is midnight **where the server
 * runs** — on a UTC host that is 07:00 in Batam, so asking for the 2nd of
 * October quietly returned the 2nd from 07:00 through the 3rd at 07:00.
 *
 * Returns undefined when neither side is usable, so the caller can leave the
 * `created_at` key off the query entirely.
 */
export function parseDateRange(
  from?: string,
  to?: string
): { gte?: Date; lt?: Date } | undefined {
  let start = startOfDay(from);
  let end = startOfDay(to);

  // Reversed by hand, almost certainly a slip. Reading it as the range the
  // person drew beats returning nothing and looking broken.
  if (start && end && start > end) [start, end] = [end, start];

  const range: { gte?: Date; lt?: Date } = {};
  if (start) range.gte = start;
  // Half-open, so the last second of the closing day is inside the range.
  if (end) range.lt = new Date(end.getTime() + DAY);

  return range.gte || range.lt ? range : undefined;
}

/** Midnight in the shop's time zone, or null when the input is not a date. */
function startOfDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(`${value}T00:00:00${LOG_UTC_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

/**
 * Split a list that is already in order into one group per calendar day,
 * keeping the order it arrived in. Used by the chronological view, where the
 * day heading is what stops the table reading as one undifferentiated run.
 */
export function groupByDay<T>(items: readonly T[], at: (item: T) => Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const key = logDayKey(at(item));
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: formatDayLabel(key), items: [item] });
    }
  }

  return groups;
}
