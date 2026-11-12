import { db } from "@/lib/db";
import type { RmaStatus } from "@prisma/client";
import { cleanVendorName, vendorKey } from "@/lib/rma/vendor";
import { holdReasonAsksTechnician } from "@/lib/rma/hold-reason";

/**
 * Data for the RMA dashboard: the queue and its headline numbers.
 *
 * The cross-case activity feed moved to /rma/logs, which queries RmaEvent
 * itself with filters and paging. It is not loaded here any more.
 *
 * Loading lives here rather than in the page so the clock is read outside any
 * component render — `react-hooks/purity` flags `Date.now()` inside one, and it
 * is right to: a component that reads the clock is not a pure function of its
 * props. Everything time-derived is computed once, here, against one instant.
 */

/** Statuses that still need someone to act, in the order the desk works them. */
export const RMA_QUEUE_STATUSES: readonly RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
];

/**
 * Whose turn it is (BL28c, owner 2026-10-03: group the dashboard by "whose
 * ball it is"). The desk owns every stage where nothing happens until it acts
 * — including `verified`, `vendor_decided` and `unit_received`, which the old
 * "Butuh Tindakan" figure left out, so it counted 5 where the desk had 7.
 * A hold that asks the technician for evidence is the technician's turn.
 */
export type RmaLane = "desk" | "vendor" | "technician";
export const DESK_STAGES: readonly RmaStatus[] = ["pending_verification", "on_hold", "verified", "vendor_decided", "unit_received"];
export const VENDOR_STAGES: readonly RmaStatus[] = ["submitted_to_vendor", "in_vendor_process"];
const AT_VENDOR = VENDOR_STAGES;

export function laneOf(status: RmaStatus, holdReason: Parameters<typeof holdReasonAsksTechnician>[0]): RmaLane {
  if (VENDOR_STAGES.includes(status)) return "vendor";
  if (status === "on_hold" && holdReasonAsksTechnician(holdReason)) return "technician";
  return "desk";
}

/**
 * A claim the technician has not handed over yet — no case exists, so no RMA
 * stage measures it. One ticket had sat there 95 days with nothing on screen
 * saying so (found 2026-10-03). A target for the desk to chase, tunable here.
 */
export const PRE_HANDOVER_SLA = { warning: 3, overdue: 7 } as const;
export function preHandoverSeverity(days: number): RmaSeverity {
  if (days >= PRE_HANDOVER_SLA.overdue) return "overdue";
  if (days >= PRE_HANDOVER_SLA.warning) return "warning";
  return "ok";
}

/**
 * A claim open this long is shown in "Lead Time Lewat 2 Minggu" (owner,
 * 2026-11-12), whatever stage it is in. Measured from when the claim came in —
 * the ticket — because that is how long the customer has been waiting.
 */
export const LONG_LEAD_DAYS = 14;

/** Days at a vendor beyond which a case is worth chasing. */
export const VENDOR_WARNING_DAYS = 7;
export const VENDOR_OVERDUE_DAYS = 14;

/**
 * How long a case may sit in each stage before the dashboard starts nagging.
 *
 * `warning` turns the row amber, `overdue` turns it red. Measured from the
 * moment the case ENTERED its current stage, not from when it was opened, so a
 * case that moved yesterday reads as fresh even if the claim is months old.
 *
 * These are targets for the desk, not contractual SLAs, and they are the one
 * thing here worth arguing about. Tune them in this table and every count,
 * badge and sort order on the dashboard follows.
 *
 * The reasoning behind each: the two stages where the unit is sitting on a
 * shelf waiting for the desk to do something (`pending_verification`,
 * `verified`) are tight, because nothing is happening to the unit. `on_hold`
 * gets a little longer because it is usually waiting on a customer.
 * The vendor stages use the existing vendor constants. `vendor_decided` and
 * `unit_received` are tight again: the customer is waiting for their unit back
 * and the ticket cannot close until the desk finishes.
 */
export const RMA_STAGE_SLA: Record<RmaStatus, { warning: number; overdue: number }> = {
  pending_verification: { warning: 2, overdue: 5 },
  on_hold: { warning: 3, overdue: 7 },
  verified: { warning: 2, overdue: 5 },
  submitted_to_vendor: { warning: VENDOR_WARNING_DAYS, overdue: VENDOR_OVERDUE_DAYS },
  in_vendor_process: { warning: VENDOR_WARNING_DAYS, overdue: VENDOR_OVERDUE_DAYS },
  vendor_decided: { warning: 3, overdue: 7 },
  unit_received: { warning: 1, overdue: 3 },
  // Terminal — never queued, never measured.
  closed: { warning: Infinity, overdue: Infinity },
  cancelled: { warning: Infinity, overdue: Infinity },
  ineligible: { warning: Infinity, overdue: Infinity },
};

export type RmaSeverity = "overdue" | "warning" | "ok";

export function rmaSeverity(status: RmaStatus, daysInStage: number): RmaSeverity {
  const sla = RMA_STAGE_SLA[status];
  if (daysInStage >= sla.overdue) return "overdue";
  if (daysInStage >= sla.warning) return "warning";
  return "ok";
}

export type RmaQueueRow = Awaited<ReturnType<typeof getRmaQueue>>["rows"][number];

export async function getRmaQueue() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [cases, closedCount, cancelledCount, awaitingCheckRaw, closedCases, decisions] = await Promise.all([
      db.rmaCase.findMany({
        where: { status: { in: [...RMA_QUEUE_STATUSES] } },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          rma_code: true,
          status: true,
          vendor_name: true,
          vendor: { select: { name: true, location: true } },
          decision: true,
          decision_notes: true,
          replacement_sn: true,
          submitted_at: true,
          created_at: true,
          hold_reason: true,
          hold_reason_code: true,
          recommended_eligible: true,
          recommendation_note: true,
          handler: { select: { id: true, name: true } },
          // When the case entered its current stage. Every RMA transition
          // writes an event, so the newest one is the stage's start.
          events: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
          ticket: {
            select: {
              id: true,
              ticket_code: true,
              customer_name: true,
              device_name: true,
              device_sn: true,
              created_at: true,
              store_location: { select: { code: true } },
            },
          },
        },
      }),
      db.rmaCase.count({ where: { status: "closed" } }),
      db.rmaCase.count({ where: { status: "cancelled" } }),
      // Claims the desk can already see but cannot act on: the technician still
      // has the unit. Read-only on the dashboard so the desk knows what is
      // coming without an RmaCase row existing before the handover.
      db.ticket.findMany({
        where: {
          ticket_type: "warranty_claim",
          status: { in: ["waiting", "on_progress"] },
          rma_case: { is: null },
        },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          ticket_code: true,
          status: true,
          created_at: true,
          customer_name: true,
          device_name: true,
          device_sn: true,
          store_location: { select: { code: true } },
          technician: { select: { name: true } },
        },
      }),
      // Every closed case, for the average turnaround and its trend.
      db.rmaCase.findMany({
        where: { status: "closed", closed_at: { not: null } },
        select: { created_at: true, closed_at: true },
      }),
      db.rmaCase.groupBy({
        by: ["decision"],
        where: { decision: { not: null } },
        _count: { _all: true },
      }),
    ]);

  // One clock read for the whole request, so every row is measured consistently.
  const nowMs = now.getTime();
  const days = (from: Date) => Math.floor((nowMs - new Date(from).getTime()) / 86_400_000);

  const awaitingCheck = awaitingCheckRaw.map((t) => {
    const daysWaiting = days(t.created_at);
    return { ...t, daysWaiting, severity: preHandoverSeverity(daysWaiting) };
  });

  const rows = cases.map((c) => {
    // Falls back to the case's own creation for a row whose events were pruned.
    const stageSince = c.events[0]?.created_at ?? c.created_at;
    const daysInStage = days(stageSince);
    return {
      ...c,
      daysAtVendor: c.submitted_at ? days(c.submitted_at) : null,
      daysOpen: days(c.created_at),
      leadDays: days(c.ticket.created_at),
      daysInStage,
      stageSince,
      severity: rmaSeverity(c.status, daysInStage),
      lane: laneOf(c.status, c.hold_reason_code),
    };
  });

  const stats = {
    active: rows.length,
    /** The desk's turn — every stage where nothing moves until it acts. */
    needsAction: rows.filter((r) => r.lane === "desk").length,
    /** The technician's turn: claims not handed over, and holds waiting on their evidence. */
    withTechnician: awaitingCheck.length + rows.filter((r) => r.lane === "technician").length,
    /** Claims not handed over yet and past their target — no case, so not in `pastDue`. */
    preHandoverLate: awaitingCheck.filter((t) => t.severity === "overdue").length,
    /** Claims sitting with the technician past the pre-handover target. */
    technicianLate:
      awaitingCheck.filter((t) => t.severity === "overdue").length +
      rows.filter((r) => r.lane === "technician" && r.severity === "overdue").length,
    atVendor: rows.filter((r) => AT_VENDOR.includes(r.status)).length,
    /**
     * Still at the vendor AND there too long. `submitted_at` stays set after a
     * case moves on, so filtering on it alone counts cases that already came
     * back — which made the "Di Vendor" card claim more late cases than it had
     * cases.
     */
    overdue: rows.filter(
      (r) =>
        AT_VENDOR.includes(r.status) &&
        r.daysAtVendor !== null &&
        r.daysAtVendor >= VENDOR_OVERDUE_DAYS
    ).length,
    /** Past its stage target — the number the dashboard leads with. */
    pastDue: rows.filter((r) => r.severity === "overdue").length,
    warning: rows.filter((r) => r.severity === "warning").length,
    closedCount,
    cancelledCount,
    /** Claims open past LONG_LEAD_DAYS since intake, handed over or not. */
    longLead:
      rows.filter((r) => r.leadDays >= LONG_LEAD_DAYS).length +
      awaitingCheck.filter((t) => t.daysWaiting >= LONG_LEAD_DAYS).length,
    /** Longest-running open case, the one most likely to need chasing. */
    oldestOpenDays: rows.reduce((max, r) => Math.max(max, r.daysOpen), 0),
    decisions: Object.fromEntries(
      decisions.map((d) => [d.decision as string, d._count._all])
    ) as Record<string, number>,

    /** Active cases nobody has taken. Work with no owner is work that stalls. */
    unassigned: rows.filter((r) => !r.handler).length,

    /**
     * Turnaround, and whether it is moving. `previous` is cases closed before
     * this month, so the two never overlap and the comparison is honest; it is
     * null until there is something to compare against.
     */
    resolution: (() => {
      const daysToClose = (c: { created_at: Date; closed_at: Date | null }) =>
        Math.round((c.closed_at!.getTime() - c.created_at.getTime()) / 86_400_000);
      const mean = (xs: number[]) =>
        xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

      const thisMonth = closedCases.filter((c) => c.closed_at! >= monthStart);
      const earlier = closedCases.filter((c) => c.closed_at! < monthStart);

      return {
        overall: mean(closedCases.map(daysToClose)),
        thisMonth: mean(thisMonth.map(daysToClose)),
        previous: mean(earlier.map(daysToClose)),
        sample: closedCases.length,
      };
    })(),

    /**
     * How claims that reached a verdict turned out. Counts decisions, not
     * cases: a case still at the vendor has no verdict to report yet.
     */
    outcome: (() => {
      const counts = Object.fromEntries(
        decisions.map((d) => [d.decision as string, d._count._all])
      ) as Record<string, number>;
      const decided = Object.values(counts).reduce((a, b) => a + b, 0);
      const rejected = counts.rejected ?? 0;
      return {
        decided,
        rejected,
        approved: decided - rejected,
        /** null rather than 100% when nothing has been decided yet. */
        successRate: decided > 0 ? Math.round(((decided - rejected) / decided) * 100) : null,
      };
    })(),

    /**
     * Open cases per vendor, worst wait first — who to chase. Grouped on the
     * folded name so one vendor spelled two ways counts once; see
     * lib/rma/vendor.ts.
     */
    vendors: (() => {
      const byKey = new Map<string, { name: string; open: number; oldestDays: number }>();
      for (const r of rows) {
        if (!r.vendor_name) continue;
        const key = vendorKey(r.vendor_name);
        const entry = byKey.get(key) ?? {
          name: cleanVendorName(r.vendor_name),
          open: 0,
          oldestDays: 0,
        };
        entry.open += 1;
        entry.oldestDays = Math.max(entry.oldestDays, r.daysAtVendor ?? r.daysInStage);
        byKey.set(key, entry);
      }
      return [...byKey.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.open - a.open);
    })(),

  };

  return { rows, awaitingCheck, stats, closedCount, cancelledCount };
}
