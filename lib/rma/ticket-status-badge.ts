import type { RmaStatus, TicketStatus } from "@prisma/client";

/**
 * Which status a ticket list should show for a warranty claim.
 *
 * `rma_process` is one ticket status covering nine RMA ones. A list showing it
 * says only "this is somewhere inside the RMA desk" — not whether the unit is
 * waiting to be verified, held for a missing document, already at the vendor,
 * or decided. Staff then open every claim one at a time to find out. When the
 * ticket is parked at `rma_process`, the case's own status is the informative
 * one, and that is what the list shows.
 *
 * Only while the ticket is at `rma_process`. Once the desk releases it the
 * ticket moves on (`done`, then the pickup chain) and the ticket's own status
 * is again the truth — a closed case must not keep a list row reading
 * "Selesai" from the RMA side while the unit still sits on the counter.
 *
 * A claim at `rma_process` with no case row should not exist; if one does, the
 * plain ticket badge is still rendered rather than nothing.
 */

export type TicketBadgeChoice =
  | { kind: "ticket"; status: TicketStatus }
  | { kind: "rma"; status: RmaStatus };

export function ticketBadgeChoice(
  ticketStatus: TicketStatus,
  rmaCaseStatus: RmaStatus | null | undefined,
): TicketBadgeChoice {
  if (ticketStatus === "rma_process" && rmaCaseStatus) {
    return { kind: "rma", status: rmaCaseStatus };
  }
  return { kind: "ticket", status: ticketStatus };
}
