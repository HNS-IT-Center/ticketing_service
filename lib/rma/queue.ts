import { db } from "@/lib/db";
import type { RmaStatus } from "@prisma/client";

/**
 * Data for the RMA dashboard: the queue, headline numbers, and a cross-case
 * activity feed.
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

/** Waiting on the RMA desk itself, as opposed to waiting on the vendor. */
const NEEDS_ACTION: readonly RmaStatus[] = ["pending_verification", "on_hold"];

/** In the vendor's hands. */
const AT_VENDOR: readonly RmaStatus[] = ["submitted_to_vendor", "in_vendor_process"];

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
};

export type RmaSeverity = "overdue" | "warning" | "ok";

export function rmaSeverity(status: RmaStatus, daysInStage: number): RmaSeverity {
  const sla = RMA_STAGE_SLA[status];
  if (daysInStage >= sla.overdue) return "overdue";
  if (daysInStage >= sla.warning) return "warning";
  return "ok";
}

export type RmaQueueRow = Awaited<ReturnType<typeof getRmaQueue>>["rows"][number];
export type RmaActivityRow = Awaited<ReturnType<typeof getRmaQueue>>["activity"][number];

export async function getRmaQueue() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [cases, closedCount, cancelledCount, closedThisMonth, decisions, events] =
    await Promise.all([
      db.rmaCase.findMany({
        where: { status: { in: [...RMA_QUEUE_STATUSES] } },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          rma_code: true,
          status: true,
          vendor_name: true,
          decision: true,
          submitted_at: true,
          created_at: true,
          hold_reason: true,
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
              store_location: { select: { code: true } },
            },
          },
        },
      }),
      db.rmaCase.count({ where: { status: "closed" } }),
      db.rmaCase.count({ where: { status: "cancelled" } }),
      db.rmaCase.count({ where: { status: "closed", closed_at: { gte: monthStart } } }),
      db.rmaCase.groupBy({
        by: ["decision"],
        where: { decision: { not: null } },
        _count: { _all: true },
      }),
      db.rmaEvent.findMany({
        orderBy: { created_at: "desc" },
        take: 15,
        select: {
          id: true,
          from_status: true,
          to_status: true,
          note: true,
          created_at: true,
          actor: { select: { id: true, name: true } },
          rma_case: {
            select: {
              id: true,
              rma_code: true,
              ticket: { select: { ticket_code: true } },
            },
          },
        },
      }),
    ]);

  // One clock read for the whole request, so every row is measured consistently.
  const nowMs = now.getTime();
  const days = (from: Date) => Math.floor((nowMs - new Date(from).getTime()) / 86_400_000);

  const rows = cases.map((c) => {
    // Falls back to the case's own creation for a row whose events were pruned.
    const stageSince = c.events[0]?.created_at ?? c.created_at;
    const daysInStage = days(stageSince);
    return {
      ...c,
      daysAtVendor: c.submitted_at ? days(c.submitted_at) : null,
      daysOpen: days(c.created_at),
      daysInStage,
      stageSince,
      severity: rmaSeverity(c.status, daysInStage),
    };
  });

  const activity = events.map((e) => ({
    ...e,
    daysAgo: days(e.created_at),
  }));

  const stats = {
    active: rows.length,
    needsAction: rows.filter((r) => NEEDS_ACTION.includes(r.status)).length,
    atVendor: rows.filter((r) => AT_VENDOR.includes(r.status)).length,
    overdue: rows.filter((r) => r.daysAtVendor !== null && r.daysAtVendor >= VENDOR_OVERDUE_DAYS)
      .length,
    /** Past its stage target — the number the dashboard leads with. */
    pastDue: rows.filter((r) => r.severity === "overdue").length,
    warning: rows.filter((r) => r.severity === "warning").length,
    closedThisMonth,
    closedCount,
    cancelledCount,
    /** Longest-running open case, the one most likely to need chasing. */
    oldestOpenDays: rows.reduce((max, r) => Math.max(max, r.daysOpen), 0),
    decisions: Object.fromEntries(
      decisions.map((d) => [d.decision as string, d._count._all])
    ) as Record<string, number>,
  };

  return { rows, activity, stats, closedCount, cancelledCount };
}
