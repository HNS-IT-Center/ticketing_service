/**
 * When a status change counts toward a technician's KPI — pure module.
 *
 * A warranty claim must be credited exactly once, and the obvious reading of
 * the data credits it twice. A claim moves `on_progress` → `rma_process` at
 * handover, sits with the RMA desk or the vendor, and when the case closes the
 * ticket goes back to `done` so the unit can be handed to the customer through
 * the normal chain. That closing `done` is written by `app/actions/rma.ts`,
 * not by the technician, but it looks exactly like any other `done` log — so
 * anything counting `new_status = 'done'` credits the claim a second time,
 * months after the work happened.
 *
 * The rule, which `lib/leaderboard.ts`, `lib/performance.ts`,
 * `app/actions/technician.ts`, `app/actions/admin.ts` and `app/actions/rma.ts`
 * all read from here rather than restating:
 *
 *     count it if  (type != 'warranty_claim' && new_status == 'done')
 *               || (type == 'warranty_claim' && new_status == 'rma_process')
 *
 * A claim closed as "not eligible" is the third case. It ends at `done` with
 * `claim_eligible = false`, and it counts as neither a success nor a failure:
 * the technician examined the unit correctly and the warranty simply did not
 * cover it. Charging them a `failed_count` for that would make it expensive to
 * turn down a claim that deserves turning down.
 */

import type { Prisma } from "@prisma/client";

/** What a status change does to the `TechnicianPerformance` counters. */
export type PerformanceEffect =
  /** tickets_handled +1, success_count +1, points credited */
  | "success"
  /** tickets_handled +1, failed_count +1, no points */
  | "failure"
  /** counters untouched */
  | "ignore";

/** Statuses that close a ticket out, for every type. */
export const PERFORMANCE_FAILURE_STATUSES = ["cancelled", "rejected"] as const;

export function performanceEffect(
  ticketType: string,
  newStatus: string,
): PerformanceEffect {
  if ((PERFORMANCE_FAILURE_STATUSES as readonly string[]).includes(newStatus)) {
    return "failure";
  }

  if (ticketType === "warranty_claim") {
    // Credited at handover — the point at which the technician's work on the
    // claim is finished. The `done` that follows a closed case, and the `done`
    // of an ineligible claim, both land on "ignore".
    return newStatus === "rma_process" ? "success" : "ignore";
  }

  return newStatus === "done" ? "success" : "ignore";
}

/** Shorthand for the one question most callers have. */
export function earnsPoints(ticketType: string, newStatus: string): boolean {
  return performanceEffect(ticketType, newStatus) === "success";
}

/**
 * The same rule as a Prisma filter over `TicketStatusLog`, so a query cannot
 * drift from `performanceEffect()`. Every log this matches satisfies
 * `earnsPoints(log.ticket.ticket_type, log.new_status)`.
 */
export const EARNING_STATUS_LOG_FILTER: Prisma.TicketStatusLogWhereInput = {
  OR: [
    {
      new_status: "done",
      ticket: { ticket_type: { not: "warranty_claim" } },
    },
    {
      new_status: "rma_process",
      ticket: { ticket_type: "warranty_claim" },
    },
  ],
};
