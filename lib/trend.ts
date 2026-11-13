/**
 * The admin dashboard's trend view (owner, 2026-11-13): the same figures day to
 * day, week to week, month to month, quarter to quarter and year to year.
 *
 * Pure — the queries live in trend-server.ts and the clock is an argument.
 * Every boundary is midnight in Batam (WIB), weeks start on Monday. The rules
 * behind each figure are the app's own, so they agree with the other reports:
 *   - finished = the ticket's FIRST paid status (lib/kpi.ts): `done`, or a
 *     claim's handover to RMA — a ticket done twice counts once;
 *   - points = lib/points.ts, the one table, plus Daftar Jasa jobs;
 *   - takings = selling price × quantity on the bill, unpriced lines left out.
 */
import type { TicketType } from "@prisma/client";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { INTAKE_TYPES } from "@/lib/store-dashboard";

const WIB_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 24 * 3600_000;

export const GRAINS = ["day", "week", "month", "quarter", "year"] as const;
export type Grain = (typeof GRAINS)[number];

export const GRAIN_LABELS: Record<Grain, string> = {
  day: "Harian",
  week: "Mingguan",
  month: "Bulanan",
  quarter: "Kuartal",
  year: "Tahunan",
};

/** What the comparison says: "vs kemarin", "vs minggu lalu", … */
export const PREVIOUS_LABELS: Record<Grain, string> = {
  day: "kemarin",
  week: "minggu lalu",
  month: "bulan lalu",
  quarter: "kuartal lalu",
  year: "tahun lalu",
};

export const CURRENT_LABELS: Record<Grain, string> = {
  day: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
  quarter: "Kuartal ini",
  year: "Tahun ini",
};

/** How many periods each view shows, the current one last. */
export const GRAIN_SPAN: Record<Grain, number> = { day: 30, week: 12, month: 12, quarter: 8, year: 5 };

/** The grain as the URL spells it (`?periode=bulanan`), so a shared link reads plainly. */
export const PERIODE_PARAM: Record<Grain, string> = {
  day: "harian",
  week: "mingguan",
  month: "bulanan",
  quarter: "kuartal",
  year: "tahunan",
};

export const DEFAULT_GRAIN: Grain = "month";

/** `?periode=` to a grain; anything unknown is the default, monthly. */
export function parsePeriode(raw: string | undefined): Grain {
  return GRAINS.find((g) => PERIODE_PARAM[g] === raw) ?? DEFAULT_GRAIN;
}

export type Bucket = {
  key: string;
  /** Short, for the axis. */
  label: string;
  /** Full, for the tooltip and the table. */
  longLabel: string;
  start: number;
  end: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** A WIB calendar date as a UTC-midnight timestamp, so date arithmetic is plain. */
function wibDate(t: number): Date {
  const d = new Date(t + WIB_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
/** The instant a WIB calendar date (given as UTC midnight) begins. */
const instant = (d: Date) => d.getTime() - WIB_OFFSET_MS;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The start of the period holding `t`, as a WIB calendar date. */
function periodStart(grain: Grain, t: number): Date {
  const d = wibDate(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "day":
      return d;
    case "week":
      return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
    case "month":
      return new Date(Date.UTC(y, m, 1));
    case "quarter":
      return new Date(Date.UTC(y, m - (m % 3), 1));
    case "year":
      return new Date(Date.UTC(y, 0, 1));
    default: {
      const never: never = grain;
      return never;
    }
  }
}

/** The calendar date `n` periods after `d`. */
function shift(grain: Grain, d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "day":
      return new Date(d.getTime() + n * DAY_MS);
    case "week":
      return new Date(d.getTime() + n * 7 * DAY_MS);
    case "month":
      return new Date(Date.UTC(y, m + n, 1));
    case "quarter":
      return new Date(Date.UTC(y, m + 3 * n, 1));
    case "year":
      return new Date(Date.UTC(y + n, 0, 1));
    default: {
      const never: never = grain;
      return never;
    }
  }
}

function labels(grain: Grain, d: Date): { label: string; longLabel: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  switch (grain) {
    case "day":
      return { label: `${day} ${MONTHS[m]}`, longLabel: `${day} ${MONTHS[m]} ${y}` };
    case "week": {
      const last = new Date(d.getTime() + 6 * DAY_MS);
      const lastText = `${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]} ${last.getUTCFullYear()}`;
      return { label: `${day} ${MONTHS[m]}`, longLabel: `${day} ${MONTHS[m]} – ${lastText}` };
    }
    case "month":
      return { label: `${MONTHS[m]} ${String(y).slice(2)}`, longLabel: `${MONTHS[m]} ${y}` };
    case "quarter": {
      const q = Math.floor(m / 3) + 1;
      return { label: `Q${q} ${String(y).slice(2)}`, longLabel: `Kuartal ${q} ${y}` };
    }
    case "year":
      return { label: String(y), longLabel: `Tahun ${y}` };
    default: {
      const never: never = grain;
      return never;
    }
  }
}

/** The last GRAIN_SPAN periods, oldest first, ending with the one holding `now`. */
export function trendBuckets(grain: Grain, now: number): Bucket[] {
  const current = periodStart(grain, now);
  const out: Bucket[] = [];
  for (let i = GRAIN_SPAN[grain] - 1; i >= 0; i--) {
    const d = shift(grain, current, -i);
    out.push({ key: ymd(d), start: instant(d), end: instant(shift(grain, d, 1)), ...labels(grain, d) });
  }
  return out;
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export type TrendInput = {
  /** Tickets opened. */
  created: { at: number; type: TicketType }[];
  /** Tickets at their first paid finish, with what that finish was worth. */
  finished: { at: number; points: number; takings: number; unpriced: number }[];
  /** Tickets at their first cancel or reject. */
  cancelled: { at: number }[];
};

/**
 * Series order on the intake chart. The kepala toko's chart uses the same list,
 * so a ticket type wears the same colour on both dashboards.
 */
export const TYPE_ORDER: readonly TicketType[] = INTAKE_TYPES;

export type TrendRow = Bucket & {
  created: number;
  createdByType: Record<TicketType, number>;
  finished: number;
  cancelled: number;
  points: number;
  takings: number;
  /** Bill lines of the finished tickets still without a selling price — not counted as 0. */
  unpriced: number;
};

function emptyTypes(): Record<TicketType, number> {
  return { service: 0, warranty_claim: 0, pc_build: 0, cleaning: 0, upgrade: 0 };
}

function indexOf(buckets: readonly Bucket[], at: number): number {
  // Few buckets (≤ 30); a scan is clearer than a search.
  for (let i = 0; i < buckets.length; i++) if (at >= buckets[i].start && at < buckets[i].end) return i;
  return -1;
}

export function trendRows(buckets: readonly Bucket[], input: TrendInput): TrendRow[] {
  const rows: TrendRow[] = buckets.map((b) => ({
    ...b,
    created: 0,
    createdByType: emptyTypes(),
    finished: 0,
    cancelled: 0,
    points: 0,
    takings: 0,
    unpriced: 0,
  }));
  for (const c of input.created) {
    const i = indexOf(buckets, c.at);
    if (i < 0) continue;
    rows[i].created += 1;
    rows[i].createdByType[c.type] += 1;
  }
  for (const f of input.finished) {
    const i = indexOf(buckets, f.at);
    if (i < 0) continue;
    rows[i].finished += 1;
    rows[i].points += f.points;
    rows[i].takings += f.takings;
    rows[i].unpriced += f.unpriced;
  }
  for (const c of input.cancelled) {
    const i = indexOf(buckets, c.at);
    if (i >= 0) rows[i].cancelled += 1;
  }
  return rows;
}

// ── The period on screen ────────────────────────────────────────────────────

export type PeriodRange = {
  /** This period so far: [start, end], end being now. */
  start: number;
  end: number;
  /** The previous period up to the same point: [prevStart, prevEnd). */
  prevStart: number;
  prevEnd: number;
};

/**
 * This period so far, and the previous one **up to the same point** — today
 * until 14:00 against yesterday until 14:00, 1–13 November against 1–13
 * October. Comparing a half-finished period with a whole one would show every
 * period falling until its last day.
 */
export function periodRange(grain: Grain, now: number): PeriodRange {
  const cur = periodStart(grain, now);
  const start = instant(cur);
  const prevStart = instant(shift(grain, cur, -1));
  // Same elapsed time, but never past the previous period's own end (31 Mar → 28 Feb).
  const prevEnd = Math.min(prevStart + (now - start), start);
  return { start, end: now, prevStart, prevEnd };
}

const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "1–13 November 2026", "28 Okt – 3 Nov 2026", "13 November 2026". */
function rangeText(from: Date, to: Date, withYear: boolean): string {
  const y = (d: Date) => (withYear ? ` ${d.getUTCFullYear()}` : "");
  const sameMonth = from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();
  if (sameMonth) {
    const days = from.getUTCDate() === to.getUTCDate() ? `${to.getUTCDate()}` : `${from.getUTCDate()}–${to.getUTCDate()}`;
    return `${days} ${MONTHS_LONG[to.getUTCMonth()]}${y(to)}`;
  }
  const short = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  return sameYear ? `${short(from)} – ${short(to)}${y(to)}` : `${short(from)} ${from.getUTCFullYear()} – ${short(to)} ${to.getUTCFullYear()}`;
}

/**
 * The header's dates: the period so far and what it is compared with, as WIB
 * calendar dates. The previous range drops its year when it shares this one's.
 */
export function periodText(grain: Grain, now: number): { current: string; previous: string } {
  const r = periodRange(grain, now);
  const curFrom = wibDate(r.start);
  const curTo = wibDate(now);
  const prevFrom = wibDate(r.prevStart);
  // prevEnd is exclusive; the last instant before it names the last day.
  const prevTo = wibDate(Math.max(r.prevStart, r.prevEnd - 1));
  return {
    current: rangeText(curFrom, curTo, true),
    previous: rangeText(prevFrom, prevTo, prevFrom.getUTCFullYear() !== curTo.getUTCFullYear()),
  };
}

// ── Headline comparison ─────────────────────────────────────────────────────

export type TrendMetric = "created" | "finished" | "takings" | "points";

export type Headline = {
  metric: TrendMetric;
  current: number;
  previous: number;
  /** Percent change, or null when the previous period had nothing to compare. */
  changePct: number | null;
};

/** This period so far against the previous one up to the same point (periodRange). */
export function headlines(grain: Grain, now: number, input: TrendInput): Headline[] {
  const { start: curStart, prevStart, prevEnd } = periodRange(grain, now);
  const inCur = (at: number) => at >= curStart && at <= now;
  const inPrev = (at: number) => at >= prevStart && at < prevEnd;

  const sum = (pick: (at: number) => boolean, metric: TrendMetric) => {
    switch (metric) {
      case "created":
        return input.created.filter((c) => pick(c.at)).length;
      case "finished":
        return input.finished.filter((f) => pick(f.at)).length;
      case "takings":
        return input.finished.reduce((s, f) => s + (pick(f.at) ? f.takings : 0), 0);
      case "points":
        return input.finished.reduce((s, f) => s + (pick(f.at) ? f.points : 0), 0);
      default: {
        const never: never = metric;
        return never;
      }
    }
  };

  return (["created", "finished", "takings", "points"] as const).map((metric) => {
    const current = sum(inCur, metric);
    const previous = sum(inPrev, metric);
    return { metric, current, previous, changePct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
  });
}

export const METRIC_LABELS: Record<TrendMetric, string> = {
  created: "Tiket masuk",
  finished: "Tiket selesai",
  takings: "Pendapatan",
  points: "Poin teknisi",
};

export const TYPE_LABELS = TICKET_TYPE_LABELS;

/** The window the queries need: the oldest bucket, and the previous-period comparison. */
export function trendWindowStart(grain: Grain, now: number): number {
  const buckets = trendBuckets(grain, now);
  const prev = instant(shift(grain, periodStart(grain, now), -1));
  return Math.min(buckets[0].start, prev);
}
