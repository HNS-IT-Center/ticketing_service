import type { Prisma, TicketStatus } from "@prisma/client";

/**
 * The RMA desk's Klaim Garansi list — which claims it shows, what the search
 * box reaches, and the sort keys — one copy, read by the page and by its
 * spreadsheet export so the file always holds what the list shows.
 */

export const CLAIM_STATUS_FILTERS = [
  "all",
  "waiting",
  "on_progress",
  "rma_process",
  "done",
  "completed",
  "cancelled",
] as const satisfies readonly ("all" | TicketStatus)[];

/** Before handover: the queue heading this way. */
const OPEN_BEFORE_HANDOVER: TicketStatus[] = ["waiting", "on_progress"];

function isClaimStatusFilter(value: string): value is (typeof CLAIM_STATUS_FILTERS)[number] {
  return (CLAIM_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * What the search box matches. The desk looks a claim up by whatever is in
 * front of it: the ticket or RMA code, the customer, or the unit itself —
 * its name (the most common ask: "cari nama barangnya"), SKU or serial number,
 * and the vendor it went to.
 */
export function claimSearchWhere(query: string): Prisma.TicketWhereInput | null {
  const q = query.trim();
  if (!q) return null;
  return {
    OR: [
      { ticket_code: { contains: q } },
      { user: { name: { contains: q } } },
      { customer_name: { contains: q } },
      { device_name: { contains: q } },
      { device_sku: { contains: q } },
      { device_brand: { contains: q } },
      { device_sn: { contains: q } },
      { rma_case: { is: { rma_code: { contains: q } } } },
      { rma_case: { is: { vendor_name: { contains: q } } } },
    ],
  };
}

/**
 * Claims only, and of those only the ones this desk has a stake in:
 *
 *   has an RmaCase        → always, whatever the ticket status. This is the
 *                           desk's own work, including cases already closed.
 *   no case, still open   → the queue heading this way; a technician may hand
 *                           it over at any moment.
 *   no case, finished     → hidden. A claim a technician resolved without
 *                           ever involving RMA is not this desk's history.
 *
 * Combined with AND because the search also uses OR, and two OR keys in one
 * object would overwrite each other rather than both apply.
 */
export function claimListWhere(status: string, query: string): Prisma.TicketWhereInput {
  const search = claimSearchWhere(query);
  return {
    ticket_type: "warranty_claim",
    AND: [
      { OR: [{ rma_case: { isNot: null } }, { status: { in: OPEN_BEFORE_HANDOVER } }] },
      ...(isClaimStatusFilter(status) && status !== "all" ? [{ status }] : []),
      ...(search ? [search] : []),
    ],
  };
}

/** The list's sort keys; anything unrecognised is most recently updated first. */
export function claimListOrderBy(sort: string): Prisma.TicketOrderByWithRelationInput {
  switch (sort) {
    case "updated_asc":
      return { updated_at: "asc" };
    case "status_asc":
      return { status: "asc" };
    case "status_desc":
      return { status: "desc" };
    case "code_asc":
      return { ticket_code: "asc" };
    case "code_desc":
      return { ticket_code: "desc" };
    default:
      return { updated_at: "desc" };
  }
}
