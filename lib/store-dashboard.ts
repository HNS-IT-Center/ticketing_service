/**
 * The kepala toko's dashboard (owner, 2026-11-09): tickets coming in, where
 * they stand, how much each technician finishes, how long each kind of case
 * takes, and which brands come back under warranty.
 *
 * Pure — the queries live in store-dashboard-server.ts, the clock is passed in,
 * and the tests need no database. Every rule here is the one the rest of the
 * app already uses, so the numbers agree with the admin's reports:
 *   - a ticket is "finished" when it first reaches the status that pays the
 *     technician (lib/kpi.ts): `done`, or for a warranty claim the handover to
 *     RMA (`rma_process`);
 *   - working time is the time log with pauses left out (lib/working-time.ts).
 */
import type { ServicePart, TicketStatus, TicketType } from "@prisma/client";
import { calcWorkingMs, type TimeLogEvent } from "@/lib/working-time";
import { servicePartLabel } from "@/lib/service-parts";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";

const DAY_MS = 24 * 3600_000;
const WIB_OFFSET_MS = 7 * 3600_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ── Period ──────────────────────────────────────────────────────────────────

export const PERIOD_PRESETS = ["today", "week", "month", "range"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
  range: "Rentang",
};

export type Period = {
  preset: PeriodPreset;
  /** Inclusive start, exclusive end — instants, midnight in Batam (WIB). */
  start: Date;
  end: Date;
  /** "YYYY-MM-DD" in WIB, for the date inputs. */
  fromDay: string;
  toDay: string;
  label: string;
};

/** "YYYY-MM-DD" of an instant, in WIB. */
export function wibDayKey(t: Date | number): string {
  return new Date(+t + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
/** The instant a WIB day starts. */
function dayStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - WIB_OFFSET_MS);
}
function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * The period on screen. Unknown or broken input falls back to this month, so a
 * hand-edited URL shows something rather than nothing. A range is at most a
 * year, and its ends are swapped when given backwards.
 */
export function parsePeriod(input: { period?: string; from?: string; to?: string }, now: number): Period {
  const today = wibDayKey(now);
  const preset: PeriodPreset = (PERIOD_PRESETS as readonly string[]).includes(input.period ?? "")
    ? (input.period as PeriodPreset)
    : "month";

  let from: string;
  let to: string; // inclusive
  if (preset === "today") {
    from = to = today;
  } else if (preset === "week") {
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    from = addDays(today, -weekday);
    to = addDays(from, 6);
  } else if (preset === "range" && DAY.test(input.from ?? "") && DAY.test(input.to ?? "")) {
    [from, to] = [input.from as string, input.to as string].sort();
    if (Date.parse(to) - Date.parse(from) > 366 * DAY_MS) from = addDays(to, -366);
  } else {
    from = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split("-").map(Number);
    to = addDays(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1);
  }
  const effective: PeriodPreset = preset === "range" && !(DAY.test(input.from ?? "") && DAY.test(input.to ?? "")) ? "month" : preset;
  return {
    preset: effective,
    start: dayStart(from),
    end: dayStart(addDays(to, 1)),
    fromDay: from,
    toDay: to,
    label: from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`,
  };
}

/** The WIB days of a period, up to and including today — the future has no data yet. */
export function periodDays(period: Period, now: number): string[] {
  const last = [period.toDay, wibDayKey(now)].sort()[0];
  const days: string[] = [];
  for (let d = period.fromDay; d <= last && days.length < 400; d = addDays(d, 1)) days.push(d);
  return days;
}

// ── Case categories ─────────────────────────────────────────────────────────

export type CaseCategory = {
  key: string;
  label: string;
  /** Set for a sub-row: the part categories are shown under "Ganti sparepart". */
  group?: "parts";
};

export const PARTS_GROUP_LABEL = "Ganti sparepart";

/**
 * What kind of case a ticket was. Service is split by the part that was
 * replaced (recorded on the ticket), because that is what decides how long it
 * takes; a service with no part recorded is "Service lainnya".
 */
export function caseCategory(ticketType: TicketType, partsReplaced: readonly ServicePart[]): CaseCategory {
  if (ticketType !== "service") return { key: ticketType, label: TICKET_TYPE_LABELS[ticketType] };
  const kinds = [...new Set(partsReplaced)];
  if (kinds.length === 0) return { key: "service_other", label: "Service lainnya" };
  if (kinds.length > 1) return { key: "parts_multiple", label: "Ganti beberapa part", group: "parts" };
  return { key: `part_${kinds[0]}`, label: `Ganti ${servicePartLabel(kinds[0])}`, group: "parts" };
}

const CATEGORY_ORDER = ["parts", "service_other", "pc_build", "cleaning", "upgrade", "warranty_claim"];

// ── Finished tickets ────────────────────────────────────────────────────────

/** A ticket whose first paid finish falls inside the period. */
export type FinishedTicket = {
  id: string;
  technicianId: string | null;
  ticketType: TicketType;
  parts: ServicePart[];
  createdAt: Date;
  finishedAt: Date;
  timeLogs: TimeLogEvent[];
};

export type DurationStats = {
  count: number;
  /** Tickets with a time log, which the working-time average is over. */
  timed: number;
  avgWorkMs: number | null;
  avgLeadMs: number | null;
};

function stats(tickets: readonly FinishedTicket[]): DurationStats {
  let work = 0;
  let timed = 0;
  let lead = 0;
  for (const t of tickets) {
    // Measured to the finish: anything logged after it (a reopened ticket)
    // belongs to other work.
    const ms = calcWorkingMs(
      t.timeLogs.filter((l) => Date.parse(l.created_at) <= +t.finishedAt),
      +t.finishedAt,
    );
    if (ms > 0) {
      work += ms;
      timed++;
    }
    lead += Math.max(0, +t.finishedAt - +t.createdAt);
  }
  return {
    count: tickets.length,
    timed,
    avgWorkMs: timed ? work / timed : null,
    avgLeadMs: tickets.length ? lead / tickets.length : null,
  };
}

export type CategoryRow = CaseCategory & DurationStats;

/** One row per kind of case, with "Ganti sparepart" summing its parts above them. */
export function byCategory(tickets: readonly FinishedTicket[]): CategoryRow[] {
  const groups = new Map<string, { cat: CaseCategory; tickets: FinishedTicket[] }>();
  for (const t of tickets) {
    const cat = caseCategory(t.ticketType, t.parts);
    const g = groups.get(cat.key) ?? { cat, tickets: [] };
    g.tickets.push(t);
    groups.set(cat.key, g);
  }
  const partRows = [...groups.values()]
    .filter((g) => g.cat.group === "parts")
    .map((g) => ({ ...g.cat, ...stats(g.tickets) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const rows: CategoryRow[] = [];
  for (const key of CATEGORY_ORDER) {
    if (key === "parts") {
      if (partRows.length) {
        const all = tickets.filter((t) => caseCategory(t.ticketType, t.parts).group === "parts");
        rows.push({ key: "parts", label: PARTS_GROUP_LABEL, ...stats(all) }, ...partRows);
      }
      continue;
    }
    const g = groups.get(key);
    if (g) rows.push({ ...g.cat, ...stats(g.tickets) });
  }
  return rows;
}

// ── Technicians ─────────────────────────────────────────────────────────────

export type Schedule = {
  /** ["Mon","Tue",…] from the user form; null when no schedule was set. */
  workDays: string[] | null;
  /** WIB day keys on leave. */
  leave: ReadonlySet<string>;
  /** Days swapped away to someone else, and days taken over from someone. */
  swappedAway: ReadonlySet<string>;
  swappedIn: ReadonlySet<string>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The days a technician was due in, among `days`: their work days, less leave
 * and shifts given away, plus shifts taken over. Null when they have no
 * schedule — the caller then has no fair denominator and says so.
 */
export function scheduledDays(days: readonly string[], schedule: Schedule): number | null {
  if (!schedule.workDays || schedule.workDays.length === 0) return null;
  let n = 0;
  for (const d of days) {
    const weekday = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
    const due = schedule.workDays.includes(weekday) && !schedule.leave.has(d) && !schedule.swappedAway.has(d);
    if (due || schedule.swappedIn.has(d)) n++;
  }
  return n;
}

export type TechnicianInput = { id: string; name: string; schedule: Schedule };

export type TechnicianRow = {
  id: string;
  name: string;
  finished: number;
  /**
   * Finished per working day. The days are the scheduled ones when the
   * technician has a schedule; without one, the days they finished at least
   * one ticket ("hari aktif"), which is said beside the figure.
   */
  perDay: number | null;
  perDayBasis: "scheduled" | "active" | null;
  scheduledDays: number | null;
  activeDays: number;
  avgWorkMs: number | null;
  active: number;
  paused: number;
  categories: CategoryRow[];
};

export function byTechnician(
  technicians: readonly TechnicianInput[],
  finished: readonly FinishedTicket[],
  open: readonly OpenTicket[],
  days: readonly string[],
): TechnicianRow[] {
  return technicians
    .map((tech) => {
      const mine = finished.filter((t) => t.technicianId === tech.id);
      const s = stats(mine);
      const sched = scheduledDays(days, tech.schedule);
      const active = new Set(mine.map((t) => wibDayKey(t.finishedAt))).size;
      const basis: TechnicianRow["perDayBasis"] = sched ? "scheduled" : sched === null && active ? "active" : null;
      const working = open.filter((t) => t.technicianId === tech.id && (t.status === "waiting" || t.status === "on_progress"));
      return {
        id: tech.id,
        name: tech.name,
        finished: mine.length,
        perDay: basis === "scheduled" ? mine.length / (sched as number) : basis === "active" ? mine.length / active : null,
        perDayBasis: basis,
        scheduledDays: sched,
        activeDays: active,
        avgWorkMs: s.avgWorkMs,
        active: working.length,
        paused: working.filter((t) => t.paused).length,
        categories: byCategory(mine),
      };
    })
    .sort((a, b) => b.finished - a.finished || a.name.localeCompare(b.name));
}

// ── Open tickets ────────────────────────────────────────────────────────────

export type OpenTicket = {
  id: string;
  code: string;
  status: TicketStatus;
  ticketType: TicketType;
  technicianId: string | null;
  technicianName: string | null;
  deviceName: string | null;
  createdAt: Date;
  paused: boolean;
};

export const PIPELINE_STAGES = [
  { key: "unassigned", label: "Menunggu teknisi" },
  { key: "queued", label: "Belum mulai dikerjakan" },
  { key: "working", label: "Dikerjakan" },
  { key: "paused", label: "Dijeda" },
  { key: "rma", label: "Di RMA" },
  { key: "handover", label: "Selesai, menunggu diambil" },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]["key"];

/** Which stage an unfinished ticket is in, or null once it is closed. */
export function pipelineStage(t: Pick<OpenTicket, "status" | "technicianId" | "paused">): PipelineStage | null {
  switch (t.status) {
    case "waiting":
      return t.technicianId ? "queued" : "unassigned";
    case "on_progress":
      return t.paused ? "paused" : "working";
    case "rma_process":
      return "rma";
    case "done":
    case "ready_for_pickup":
    case "waiting_pickup":
    case "handed_to_courier":
      return "handover";
    case "delivered":
    case "completed":
    case "cancelled":
    case "rejected":
      return null;
    default: {
      const _exhaustive: never = t.status;
      return _exhaustive;
    }
  }
}

export function pipeline(open: readonly OpenTicket[]): { key: PipelineStage; label: string; count: number }[] {
  return PIPELINE_STAGES.map((s) => ({ ...s, count: open.filter((t) => pipelineStage(t) === s.key).length }));
}

/** Tickets still on the bench, the longest-waiting first. */
export function oldestUnfinished(open: readonly OpenTicket[], now: number, limit = 6) {
  return open
    .filter((t) => t.status === "waiting" || t.status === "on_progress")
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .slice(0, limit)
    .map((t) => ({ ...t, ageDays: Math.floor((now - +t.createdAt) / DAY_MS) }));
}



// ── Intake ──────────────────────────────────────────────────────────────────

export const INTAKE_TYPES: TicketType[] = ["service", "cleaning", "pc_build", "upgrade", "warranty_claim"];

export type IntakeBucket = { key: string; label: string; counts: Record<TicketType, number>; total: number };

/**
 * Tickets received, per day — or per month once the period runs past two
 * months, where daily bars would be too thin to read.
 */
export function intakeSeries(
  created: readonly { createdAt: Date; ticketType: TicketType }[],
  days: readonly string[],
): IntakeBucket[] {
  const monthly = days.length > 62;
  const keyOf = (day: string) => (monthly ? day.slice(0, 7) : day);
  const labelOf = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return monthly ? `${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
  };
  const buckets = new Map<string, IntakeBucket>();
  for (const day of days) {
    const key = keyOf(day);
    if (!buckets.has(key)) {
      const counts = Object.fromEntries(INTAKE_TYPES.map((t) => [t, 0])) as Record<TicketType, number>;
      buckets.set(key, { key, label: labelOf(key), counts, total: 0 });
    }
  }
  for (const t of created) {
    const b = buckets.get(keyOf(wibDayKey(t.createdAt)));
    if (!b) continue;
    b.counts[t.ticketType]++;
    b.total++;
  }
  return [...buckets.values()];
}

// ── Display ─────────────────────────────────────────────────────────────────

/** "1 j 25 m", "40 m", "3,4 hari" — durations as staff read them. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= DAY_MS) return `${(ms / DAY_MS).toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`;
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "< 1 m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} j ${m} m` : `${m} m`;
}
