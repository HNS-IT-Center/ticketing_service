import type { Prisma, RmaStatus, TicketStatus } from "@prisma/client";
import { readSort, type SortState } from "@/lib/table-sort";
import { rmaStatusDisplay } from "@/lib/status-display";

/**
 * The RMA desk's Klaim Garansi list — which claims it shows, what the search
 * box reaches, and the sort keys — one copy, read by the page and by its
 * spreadsheet export so the file always holds what the list shows.
 */

/**
 * The status filter follows the RMA case's stage — what the list's Status
 * column shows — not the technician's ticket status (RMA desk, 2026-11-11).
 * "not_handed" is a claim still with the technician, which has no case yet.
 * In the desk's working order.
 */
export const CLAIM_STATUS_FILTERS = [
  "all",
  "not_handed",
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "closed",
  "ineligible",
  "cancelled",
] as const satisfies readonly ("all" | "not_handed" | RmaStatus)[];
export type ClaimStatusFilter = (typeof CLAIM_STATUS_FILTERS)[number];

export function claimStatusLabel(f: ClaimStatusFilter): string {
  if (f === "all") return "Semua status";
  if (f === "not_handed") return "Belum diserahkan ke RMA";
  return rmaStatusDisplay(f).label;
}

/** The stage a claim is at, for counting the filter's options. */
export function claimStatusOf(rmaStatus: RmaStatus | null | undefined): Exclude<ClaimStatusFilter, "all"> {
  return rmaStatus ?? "not_handed";
}

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

export function isClaimStatusFilter(value: string): value is ClaimStatusFilter {
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
      ...(isClaimStatusFilter(status) && status !== "all"
        ? [status === "not_handed" ? { rma_case: { is: null } } : { rma_case: { is: { status } } }]
        : []),
      ...(search ? [search] : []),
      ...(ownership ? [ownership] : []),
    ],
  };
}

/** The list's sort columns, each `_asc` or `_desc`; anything unrecognised is most recently updated first. */
export const CLAIM_SORT_KEYS = ["code", "rma", "customer", "status", "updated", "created"] as const;
export const DEFAULT_CLAIM_SORT: SortState = { key: "updated", dir: "desc" };

/**
 * Status sorts by the RMA stage, in the order a case moves through them (the
 * enum's), and claims not handed over yet by their ticket status after it.
 */
export function claimListOrderBy(sort: string): Prisma.TicketOrderByWithRelationInput | Prisma.TicketOrderByWithRelationInput[] {
  const { key, dir } = readSort(sort, CLAIM_SORT_KEYS, DEFAULT_CLAIM_SORT);
  switch (key) {
    case "code":
      return { ticket_code: dir };
    case "rma":
      return [{ rma_case: { rma_code: dir } }, { updated_at: "desc" }];
    case "customer":
      return [{ customer_name: dir }, { user: { name: dir } }];
    case "status":
      return [{ rma_case: { status: dir } }, { status: dir }, { updated_at: "desc" }];
    case "created":
      return { created_at: dir };
    default:
      return { updated_at: dir };
  }
}
