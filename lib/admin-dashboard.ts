/**
 * Ringkasan Bisnis — the administrator's dashboard (owner, 2026-11-13).
 *
 * Pure: rows and the clock in, figures out; the queries live in
 * admin-dashboard-server.ts. Every rule is one the rest of the app already
 * uses, so the figures agree with the other screens:
 *   - finished = a ticket's FIRST paid status (lib/kpi.ts `earnsPoints`):
 *     `done`, or a warranty claim's handover to RMA — a ticket done twice, or a
 *     claim handed over and then closed `done`, counts once;
 *   - points = lib/points.ts (type + Daftar Jasa jobs); a ticket whose points
 *     an administrator took off is worth 0, though it still counts as finished;
 *   - takings = selling price × quantity on the bill (lib/charges.ts
 *     `summarizeCharges`, the bill's own sum), credited when the ticket first
 *     finished — the Target Teknisi rule. A line with no price is counted
 *     apart, never as 0. Harga modal is never read;
 *   - working time = lib/working-time.ts up to the finish, pauses left out.
 */
import type { ChargeKind, TicketType } from "@prisma/client";
import { summarizeCharges } from "@/lib/charges";
import { earnsPoints } from "@/lib/kpi";
import { ticketTotalPoints } from "@/lib/points";
import { progress, type MonthTarget, type Progress } from "@/lib/reports/targets";
import type { TechnicianTarget } from "@/lib/reports/technicians";
import { TYPE_ORDER, type PeriodRange } from "@/lib/trend";
import { calcWorkingMs, type TimeLogEvent } from "@/lib/working-time";

// ── Finishes ────────────────────────────────────────────────────────────────

export type PaidLog = { ticketId: string; ticketType: string; newStatus: string; at: number };

/**
 * The first paid finish of each ticket among `logs`, skipping a ticket already
 * paid before them. Re-applies the KPI rule, so a log that does not earn (a
 * claim's closing `done`) is never a finish, whatever the query returned.
 */
export function firstPaidFinishes(logs: readonly PaidLog[], paidBefore: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of [...logs].sort((a, b) => a.at - b.at)) {
    if (paidBefore.has(l.ticketId) || out.has(l.ticketId)) continue;
    if (earnsPoints(l.ticketType, l.newStatus)) out.set(l.ticketId, l.at);
  }
  return out;
}

export type ChargeIn = { kind: ChargeKind; quantity: number; unit_price: number | null; job_points: number | null };

export type FinishedTicketIn = {
  id: string;
  ticketType: TicketType;
  deviceType: string | null;
  cleaningPackage: string | null;
  pointsExcluded: boolean;
  storeId: string | null;
  technicianId: string | null;
  charges: readonly ChargeIn[];
  timeLogs: readonly TimeLogEvent[];
};

export type Finish = {
  id: string;
  at: number;
  type: TicketType;
  storeId: string | null;
  technicianId: string | null;
  points: number;
  takings: number;
  /** Bill lines without a selling price. */
  unpriced: number;
  workMs: number;
};

/** What one finished ticket was worth, measured at its first paid finish `at`. */
export function finishFacts(t: FinishedTicketIn, at: number): Finish {
  const points = ticketTotalPoints({
    ticket_type: t.ticketType,
    device_type: t.deviceType,
    cleaning_detail: { service_package: t.cleaningPackage },
    charges: t.charges.filter((c) => c.kind === "service_fee"),
    points_excluded_at: t.pointsExcluded ? new Date(at) : null,
  });
  // No unit_cost is passed: the summary then leaves cost out entirely.
  const bill = summarizeCharges(t.charges.map((c) => ({ kind: c.kind, quantity: c.quantity, unit_price: c.unit_price })));
  // Anything logged after the finish (a reopened ticket) belongs to other work.
  const workMs = calcWorkingMs(
    t.timeLogs.filter((l) => Date.parse(l.created_at) <= at),
    at,
  );
  return {
    id: t.id,
    at,
    type: t.ticketType,
    storeId: t.storeId,
    technicianId: t.technicianId,
    points,
    takings: bill.total,
    unpriced: bill.unpriced,
    workMs,
  };
}

// ── Totals for the period on screen ─────────────────────────────────────────

export type CreatedIn = { at: number; type: TicketType; storeId: string | null };

const inPeriod = (range: PeriodRange) => (at: number) => at >= range.start && at <= range.end;

export function emptyByType(): Record<TicketType, number> {
  return { service: 0, warranty_claim: 0, pc_build: 0, cleaning: 0, upgrade: 0 };
}

export type PeriodTotals = { created: number; finished: number; points: number; takings: number; unpriced: number };

export function periodTotals(created: readonly CreatedIn[], finishes: readonly Finish[], range: PeriodRange): PeriodTotals {
  const inside = inPeriod(range);
  const done = finishes.filter((f) => inside(f.at));
  return {
    created: created.filter((c) => inside(c.at)).length,
    finished: done.length,
    points: done.reduce((s, f) => s + f.points, 0),
    takings: done.reduce((s, f) => s + f.takings, 0),
    unpriced: done.reduce((s, f) => s + f.unpriced, 0),
  };
}

// ── Per store ───────────────────────────────────────────────────────────────

export type StoreSummary = {
  id: string;
  name: string;
  created: number;
  finished: number;
  takings: number;
  unpriced: number;
  /** Tickets opened in the period, by type, in TYPE_ORDER. */
  byType: Record<TicketType, number>;
  /** Distinct tickets on the store's follow-up lists, now (not per period). */
  followups: number;
};

export function storeSummaries(
  stores: readonly { id: string; name: string }[],
  created: readonly CreatedIn[],
  finishes: readonly Finish[],
  range: PeriodRange,
  followupsByStore: ReadonlyMap<string, number>,
): StoreSummary[] {
  const inside = inPeriod(range);
  return stores.map((s) => {
    const mineCreated = created.filter((c) => c.storeId === s.id && inside(c.at));
    const mineDone = finishes.filter((f) => f.storeId === s.id && inside(f.at));
    const byType = emptyByType();
    for (const c of mineCreated) byType[c.type] += 1;
    return {
      id: s.id,
      name: s.name,
      created: mineCreated.length,
      finished: mineDone.length,
      takings: mineDone.reduce((sum, f) => sum + f.takings, 0),
      unpriced: mineDone.reduce((sum, f) => sum + f.unpriced, 0),
      byType,
      followups: followupsByStore.get(s.id) ?? 0,
    };
  });
}

/** The composition bar's segments: share of each type, in TYPE_ORDER, empty ones left out. */
export function typeShares(byType: Record<TicketType, number>): { type: TicketType; count: number; percent: number }[] {
  const total = TYPE_ORDER.reduce((s, t) => s + byType[t], 0);
  if (total === 0) return [];
  return TYPE_ORDER.filter((t) => byType[t] > 0).map((t) => ({ type: t, count: byType[t], percent: (byType[t] / total) * 100 }));
}

// ── Per technician ──────────────────────────────────────────────────────────

export type TargetProgress = { measure: "points" | "jobs"; progress: Progress } | null;

/**
 * The bar toward this month's target, computed as the Target Teknisi report
 * computes it (its row, its target): the points target when one is set, else
 * the jobs target, else none. Revenue is not shown here — it is money.
 */
export function targetProgress(row: TechnicianTarget | undefined, target: MonthTarget): TargetProgress {
  const points = progress(row?.points ?? 0, target.points);
  if (points) return { measure: "points", progress: points };
  const jobs = progress(row?.jobs ?? 0, target.jobs);
  if (jobs) return { measure: "jobs", progress: jobs };
  return null;
}

export type TechnicianSummary = {
  id: string;
  name: string;
  points: number;
  finished: number;
  workMs: number;
  target: TargetProgress;
};

/**
 * Every technician given (the active ones, plus anyone who finished a ticket
 * in the period), most points first. A technician with nothing is listed as
 * zeros rather than left out.
 */
export function technicianSummaries(
  technicians: readonly { id: string; name: string }[],
  finishes: readonly Finish[],
  range: PeriodRange,
  targets: ReadonlyMap<string, TargetProgress>,
): TechnicianSummary[] {
  const inside = inPeriod(range);
  return technicians
    .map((t) => {
      const mine = finishes.filter((f) => f.technicianId === t.id && inside(f.at));
      return {
        id: t.id,
        name: t.name,
        points: mine.reduce((s, f) => s + f.points, 0),
        finished: mine.length,
        workMs: mine.reduce((s, f) => s + f.workMs, 0),
        target: targets.get(t.id) ?? null,
      };
    })
    .sort((a, b) => b.points - a.points || b.finished - a.finished || a.name.localeCompare(b.name, "id"));
}

export type TechnicianTeam = {
  /** Null for technicians on no store yet. */
  storeId: string | null;
  name: string;
  members: TechnicianSummary[];
  points: number;
  finished: number;
};

/**
 * The technicians as store teams, one slide each (owner, 2026-11-13). A
 * technician on two stores is in both teams with their whole figures; one on
 * no store is in "Belum ada toko". Each team keeps the points ranking; a store
 * without technicians is left out.
 */
export function technicianTeams(
  stores: readonly { id: string; name: string }[],
  technicians: readonly TechnicianSummary[],
  storesOf: ReadonlyMap<string, readonly string[]>,
): TechnicianTeam[] {
  const team = (storeId: string | null, name: string, members: TechnicianSummary[]): TechnicianTeam => ({
    storeId,
    name,
    members,
    points: members.reduce((s, m) => s + m.points, 0),
    finished: members.reduce((s, m) => s + m.finished, 0),
  });
  const known = new Set(stores.map((s) => s.id));
  const teams = stores
    .map((s) => team(s.id, s.name, technicians.filter((t) => (storesOf.get(t.id) ?? []).includes(s.id))))
    .filter((t) => t.members.length > 0);
  const loose = technicians.filter((t) => !(storesOf.get(t.id) ?? []).some((id) => known.has(id)));
  if (loose.length) teams.push(team(null, "Belum ada toko", loose));
  return teams;
}

/** "64 j 5 m", "45 m", "0 j" — hours first, for a period's total. */
export function hoursText(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return m === 0 ? "0 j" : `${m} m`;
  return m === 0 ? `${h} j` : `${h} j ${m} m`;
}

// ── Needs attention (now, not per period) ───────────────────────────────────

export type FollowupRow = { ticketId: string; storeId: string | null; technician: string | null; urgency: "ok" | "warn" | "overdue" };

export type Attention = {
  /** Waiting or being worked on with nobody on it. */
  unassigned: number;
  /** Waiting or being worked on past the stale limit (lib/store-followups). */
  staleOverdue: number;
  /** Finished and not collected. */
  pickup: number;
  /** Finished service tickets whose bill is still a draft. */
  billing: number;
  /** Distinct tickets on any follow-up list, per store. */
  perStore: Map<string, number>;
};

export function attention(f: {
  stale: readonly FollowupRow[];
  pickup: readonly FollowupRow[];
  vendor: readonly FollowupRow[];
  billing: readonly FollowupRow[];
  code: readonly FollowupRow[];
}): Attention {
  const perStoreSets = new Map<string, Set<string>>();
  for (const list of [f.stale, f.pickup, f.vendor, f.billing, f.code]) {
    for (const item of list) {
      if (!item.storeId) continue;
      const set = perStoreSets.get(item.storeId) ?? new Set<string>();
      set.add(item.ticketId);
      perStoreSets.set(item.storeId, set);
    }
  }
  return {
    unassigned: f.stale.filter((i) => i.technician === null).length,
    staleOverdue: f.stale.filter((i) => i.urgency === "overdue").length,
    pickup: f.pickup.length,
    billing: f.billing.length,
    perStore: new Map([...perStoreSets].map(([k, v]) => [k, v.size])),
  };
}

// ── Chart helpers ───────────────────────────────────────────────────────────

/** "Tumpukan bertambah 9" / "berkurang 3" / "tetap" — what one bucket did to the backlog. */
export function backlogText(created: number, finished: number): string {
  const d = created - finished;
  if (d > 0) return `Tumpukan bertambah ${d}`;
  if (d < 0) return `Tumpukan berkurang ${-d}`;
  return "Tumpukan tetap";
}
