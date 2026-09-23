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

  const rows = cases.map((c) => ({
    ...c,
    daysAtVendor: c.submitted_at ? days(c.submitted_at) : null,
    daysOpen: days(c.created_at),
  }));

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
