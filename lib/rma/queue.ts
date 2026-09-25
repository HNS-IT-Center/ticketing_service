import { db } from "@/lib/db";
import type { RmaStatus } from "@prisma/client";
import { cleanVendorName, vendorKey } from "@/lib/rma/vendor";
import { countByBrand, DEVICE_TYPE_LABELS } from "@/lib/rma/device";

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

  const [
    cases,
    closedCount,
    cancelledCount,
    closedThisMonth,
    openedThisMonth,
    claimTickets,
    closedCases,
    decisions,
  ] = await Promise.all([
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
      db.rmaCase.count({ where: { created_at: { gte: monthStart } } }),
      // Every warranty claim ever raised, for the brand and device-type mix.
      // Deliberately all of them, open and closed: the question "which brand
      // gets claimed most" is not about the current backlog.
      db.ticket.findMany({
        where: { ticket_type: "warranty_claim" },
        select: { device_name: true, device_type: true },
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

  const stats = {
    active: rows.length,
    needsAction: rows.filter((r) => NEEDS_ACTION.includes(r.status)).length,
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
    closedThisMonth,
    openedThisMonth,
    /** Positive means the pile is growing this month. */
    netThisMonth: openedThisMonth - closedThisMonth,
    closedCount,
    cancelledCount,
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

    /** Claims per manufacturer, across every claim ever raised. */
    brands: countByBrand(claimTickets.map((t) => t.device_name)),

    /** Claims per device category, using the enum rather than free text. */
    deviceTypes: (() => {
      const counts = new Map<string, number>();
      for (const t of claimTickets) {
        counts.set(t.device_type, (counts.get(t.device_type) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([type, count]) => ({
          type,
          label: DEVICE_TYPE_LABELS[type as keyof typeof DEVICE_TYPE_LABELS] ?? type,
          count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    })(),

    /** Denominator for both breakdowns above. */
    totalClaims: claimTickets.length,
  };

  return { rows, stats, closedCount, cancelledCount };
}
