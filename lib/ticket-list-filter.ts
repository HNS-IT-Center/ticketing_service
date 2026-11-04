import type { Prisma, TicketStatus } from "@prisma/client";

/**
 * The chips above every portal's ticket list, and the Prisma filter each one
 * means — one copy.
 *
 * Most chips name a `TicketStatus`, but two do not: `unassigned` filters on
 * `technician_id`, and `warranty_claim` filters on `ticket_type`. A claim is
 * worth its own chip because it is the one kind of ticket that leaves the
 * portals entirely — it sits with the RMA desk under `rma_process` and comes
 * back as `done` — so looking for "the warranty claims" by status means knowing
 * which stage each one is at. Filtering by type finds all of them at once.
 *
 * It also replaces `status: filter as any`, which handed Prisma whatever the
 * query string contained: an unknown chip key now falls back to "everything"
 * rather than reaching the database as an invalid enum value.
 */

export type TicketListFilter = { key: string; label: string };

export const TICKET_FILTER_ALL = "all";
export const TICKET_FILTER_UNASSIGNED = "unassigned";
export const TICKET_FILTER_WARRANTY_CLAIM = "warranty_claim";

/** Every value `Ticket.status` may hold, for validating a chip key. */
const TICKET_STATUSES: readonly TicketStatus[] = [
  "waiting",
  "on_progress",
  "rma_process",
  "done",
  "ready_for_pickup",
  "waiting_pickup",
  "handed_to_courier",
  "delivered",
  "completed",
  "cancelled",
  "rejected",
];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export const ADMIN_TICKET_FILTERS: readonly TicketListFilter[] = [
  { key: TICKET_FILTER_ALL, label: "All" },
  { key: TICKET_FILTER_UNASSIGNED, label: "Unassigned" },
  { key: "waiting", label: "Waiting" },
  { key: "on_progress", label: "On Progress" },
  { key: TICKET_FILTER_WARRANTY_CLAIM, label: "Warranty Claim" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
];

export const TECHNICIAN_TICKET_FILTERS: readonly TicketListFilter[] = [
  { key: TICKET_FILTER_ALL, label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "on_progress", label: "On Progress" },
  { key: TICKET_FILTER_WARRANTY_CLAIM, label: "Warranty Claim" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

/**
 * The `where` fragment a chip means. Merge it into the page's own `where`
 * rather than replacing it — the Sales scope and the search terms are separate.
 */
export function ticketListWhere(filter: string): Prisma.TicketWhereInput {
  if (filter === TICKET_FILTER_UNASSIGNED) return { technician_id: null };
  if (filter === TICKET_FILTER_WARRANTY_CLAIM) return { ticket_type: "warranty_claim" };
  if (isTicketStatus(filter)) return { status: filter };
  // `all`, and anything unrecognised that arrived in the query string.
  return {};
}
