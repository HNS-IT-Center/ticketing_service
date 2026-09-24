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
 * `claim_eligible = false`, and it is credited exactly like a handover: the
 * examination was real work and the conclusion was correct. Paying it less than
 * a handover would reward pushing a hopeless unit to the RMA desk rather than
 * turning it down, which is the opposite of what the desk needs.
 *
 * That is why the verdict for a claim cannot be read from (type, status) alone
 * — both an ineligible claim and a claim returning from a closed case sit at
 * `done`, and only `claim_eligible` tells them apart.
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
  /**
   * `TicketWarrantyDetail.claim_eligible` for this ticket. Only consulted for a
   * `warranty_claim` reaching `done`, where it is the sole thing separating
   * "examined and turned down" from "came back from the RMA desk". Leaving it
   * out is read as "not an ineligibility decision", which is the safe default:
   * the claim was already credited at handover.
   */
  claimEligible?: boolean | null,
): PerformanceEffect {
  if ((PERFORMANCE_FAILURE_STATUSES as readonly string[]).includes(newStatus)) {
    return "failure";
  }

  if (ticketType === "warranty_claim") {
    // Handover to the RMA desk: the technician's work on the claim ends here.
    if (newStatus === "rma_process") return "success";

    // `done` is two different events. Turned down after examination, it is
    // credited the same as a handover. Written by rma.ts when a case closes, it
    // credits nothing, because the handover already did.
    if (newStatus === "done") return claimEligible === false ? "success" : "ignore";

    return "ignore";
  }

  return newStatus === "done" ? "success" : "ignore";
}

/** Shorthand for the one question most callers have. */
export function earnsPoints(
  ticketType: string,
  newStatus: string,
  claimEligible?: boolean | null,
): boolean {
  return performanceEffect(ticketType, newStatus, claimEligible) === "success";
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
    // Turned down after examination. A claim that went to the RMA desk keeps
    // `claim_eligible = true`, so its closing `done` stays out of this branch
    // and cannot be credited a second time.
    {
      new_status: "done",
      ticket: {
        ticket_type: "warranty_claim",
        warranty_detail: { is: { claim_eligible: false } },
      },
    },
  ],
};
