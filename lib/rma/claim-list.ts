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

/**
 * Whose unit the claim is for: a customer's ("Klaim User") or the shop's own
 * stock ("Klaim Toko"). The desk works the two differently — a store-stock
 * unit needs its transfer number and the supplier's claim number — so it asked
 * to see them apart (2026-11-11).
 */
export const CLAIM_OWNER_FILTERS = ["all", "customer", "store_stock"] as const;
export type ClaimOwnerFilter = (typeof CLAIM_OWNER_FILTERS)[number];

export const CLAIM_OWNER_LABELS: Record<ClaimOwnerFilter, string> = {
  all: "Semua",
  customer: "Klaim User",
  store_stock: "Klaim Toko",
};

export function readClaimOwner(value: string | null | undefined): ClaimOwnerFilter {
  return (CLAIM_OWNER_FILTERS as readonly string[]).includes(value ?? "") ? (value as ClaimOwnerFilter) : "all";
}

/**
 * Ownership is read from the case once there is one (the desk confirms it at
 * handover), else from the intake. A claim with neither is a customer's: the
 * intake only began asking on 2026-10-08, and before that it could open a
 * claim for a customer only — so every older claim without a case is one.
 */
export function claimOwnerWhere(owner: ClaimOwnerFilter): Prisma.TicketWhereInput | null {
  switch (owner) {
    case "all":
      return null;
    case "store_stock":
      return {
        OR: [
          { rma_case: { is: { unit_ownership: "store_stock" } } },
          { rma_case: { is: null }, warranty_detail: { is: { unit_ownership: "store_stock" } } },
        ],
      };
    case "customer":
      return {
        OR: [
          { rma_case: { is: { unit_ownership: "customer" } } },
          {
            rma_case: { is: null },
            OR: [
              { warranty_detail: { is: null } },
              { warranty_detail: { is: { unit_ownership: null } } },
              { warranty_detail: { is: { unit_ownership: "customer" } } },
            ],
          },
        ],
      };
    default: {
      const _exhaustive: never = owner;
      return _exhaustive;
    }
  }
}

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
export function claimListWhere(status: string, query: string, owner: ClaimOwnerFilter = "all"): Prisma.TicketWhereInput {
  const search = claimSearchWhere(query);
  const ownership = claimOwnerWhere(owner);
  return {
    ticket_type: "warranty_claim",
    AND: [
      { OR: [{ rma_case: { isNot: null } }, { status: { in: OPEN_BEFORE_HANDOVER } }] },
      ...(isClaimStatusFilter(status) && status !== "all" ? [{ status }] : []),
      ...(search ? [search] : []),
      ...(ownership ? [ownership] : []),
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
