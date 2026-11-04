import type { Prisma, TicketStatus } from "@prisma/client";

/**
 * "This service is finished, but a part fitted on it still has no Accurate
 * code" — one copy of that rule, for the dashboards and the ticket pages.
 *
 * A part is fitted before Accurate has received it, so it is recorded under a
 * plain name ("Baterai") and given its code later through "Masukkan kode" in
 * Rincian Biaya (`linkPartCatalogAction`). While the ticket is still being
 * worked on that is normal. Once the service is done, nothing on screen asked
 * anyone to come back, and the cashier then re-enters the invoice into Accurate
 * without the item code. These alerts are that reminder.
 *
 * Cancelled and rejected tickets are left out: there is no bill to enter.
 */

/** From the technician's `done` onwards — the service itself is finished. */
export const SERVICE_READY_STATUSES: readonly TicketStatus[] = [
  "done",
  "ready_for_pickup",
  "waiting_pickup",
  "handed_to_courier",
  "delivered",
  "completed",
];

export function isServiceReady(status: TicketStatus): boolean {
  return SERVICE_READY_STATUSES.includes(status);
}

/** A part still waiting for its code: nothing was linked from the catalogue. */
export function isAwaitingCode(part: { sku: string | null }): boolean {
  return !part.sku;
}

/** `isAwaitingCode` as a Prisma filter — the two must agree, empty string included. */
export const AWAITING_CODE_PART_WHERE = {
  OR: [{ sku: null }, { sku: "" }],
} satisfies Prisma.TicketReplacedPartWhereInput;

/**
 * How many of a ticket's parts should be flagged on its page right now —
 * 0 while the work is still going on, or when every part has its code.
 */
export function partsAwaitingCodeCount(ticket: {
  ticket_type: string;
  status: TicketStatus;
  replaced_parts: readonly { sku: string | null }[];
}): number {
  if (ticket.ticket_type !== "service" || !isServiceReady(ticket.status)) return 0;
  return ticket.replaced_parts.filter(isAwaitingCode).length;
}

/**
 * Tickets to flag, within `scope` (whose tickets the viewer is responsible for:
 * their own, their stores', or all of them).
 */
export function ticketsAwaitingPartCodeWhere(scope: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
  return {
    AND: [
      scope,
      {
        ticket_type: "service",
        status: { in: [...SERVICE_READY_STATUSES] },
        replaced_parts: { some: AWAITING_CODE_PART_WHERE },
      },
    ],
  };
}

/**
 * The bell entry for the technician holding the ticket, sent when it reaches
 * `done` with parts still uncoded. The dashboard card and the ticket banner
 * stay until the code is in; this is the nudge that says so at the time.
 */
export function partCodeReminderMessage(ticketCode: string, count: number): string {
  return `⚠️ #${ticketCode} selesai, tapi ${count} part belum punya kode Accurate. Setelah barangnya diterima di Accurate, buka Rincian Biaya → Masukkan kode, lalu pilih sparepart yang dipakai.`;
}
