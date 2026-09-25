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
 * There is only one paid exit, and that is deliberate. The technician no longer
 * decides whether a claim is eligible — they examine the unit, document it, and
 * hand it over; the RMA desk decides. So every claim passes through
 * `rma_process`, and every `done` a claim reaches afterwards (case closed, or
 * the desk finding it ineligible) is written by app/actions/rma.ts, long after
 * the technician's work was already paid for.
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
    // Handover to the RMA desk: the technician's work on the claim ends here,
    // and it is the only thing that pays. Whatever the desk decides afterwards
    // sends the ticket to `done`, which credits nothing.
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
