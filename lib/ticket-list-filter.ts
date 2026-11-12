import type { Prisma, TicketStatus } from "@prisma/client";
import { ticketStatusDisplay } from "./status-display";
import { readSort, sortRows, type SortState, type SortValue } from "./table-sort";

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
export const TICKET_STATUSES: readonly TicketStatus[] = [
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

/**
 * The search box on the All Tickets list: code, account name or customer name.
 * The spreadsheet export reads the same function, so it exports what is listed.
 */
export function ticketSearchWhere(query: string): Prisma.TicketWhereInput {
  const q = query.trim();
  if (!q) return {};
  // Code, customer (the account and the name typed at intake), and the unit
  // or parts — "nama barang" — by name, SKU or serial number.
  return {
    OR: [
      { ticket_code: { contains: q } },
      { user: { name: { contains: q } } },
      { customer_name: { contains: q } },
      { device_name: { contains: q } },
      { device_sku: { contains: q } },
      { device_brand: { contains: q } },
      { device_sn: { contains: q } },
      { replaced_parts: { some: { OR: [{ item_name: { contains: q } }, { sku: { contains: q } }] } } },
    ],
  };
}

/**
 * The All Tickets sort keys. Anything unrecognised is the most recently
 * touched first: a new ticket and one whose status just moved both rise to the
 * top, since creating and every status change write `updated_at`.
 */
export const DEFAULT_TICKET_SORT = "updated_desc";

/** The columns a ticket list sorts by, each ascending or descending (`code_asc` …). */
export const TICKET_SORT_KEYS = ["code", "type", "customer", "technician", "store", "status", "updated", "created"] as const;
export const DEFAULT_TICKET_SORT_STATE: SortState = { key: "updated", dir: "desc" };

/**
 * The order a sort value means. Status sorts in the order a ticket moves
 * through (the enum's), not alphabetically; a name sort puts the typed
 * customer name first, then the account's.
 */
export function ticketListOrderBy(sort: string): Prisma.TicketOrderByWithRelationInput | Prisma.TicketOrderByWithRelationInput[] {
  const { key, dir } = readSort(sort, TICKET_SORT_KEYS, DEFAULT_TICKET_SORT_STATE);
  switch (key) {
    case "code":
      return { ticket_code: dir };
    case "type":
      return [{ ticket_type: dir }, { updated_at: "desc" }];
    case "customer":
      return [{ customer_name: dir }, { user: { name: dir } }];
    case "technician":
      return [{ technician: { name: dir } }, { updated_at: "desc" }];
    case "store":
      return [{ store_location: { name: dir } }, { updated_at: "desc" }];
    case "status":
      return [{ status: dir }, { updated_at: "desc" }];
    case "created":
      return { created_at: dir };
    default:
      return { updated_at: dir };
  }
}

export type ProgressOption = { value: string; label: string };

/**
 * The "Progres" dropdown (owner, 2026-11-12: a filter for every progress):
 * every ticket status in the order a ticket moves through them, each with how
 * many tickets the list holds in it, after the special filters the list offers.
 * The value `""` is "all" — the select leaves it out of the URL.
 */
export function ticketProgressOptions(
  counts: Partial<Record<TicketStatus, number>>,
  extras: { unassigned?: number; warrantyClaim?: number } = {},
): ProgressOption[] {
  const total = TICKET_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  return [
    { value: "", label: `Semua progres (${total})` },
    ...(extras.unassigned !== undefined ? [{ value: TICKET_FILTER_UNASSIGNED, label: `Unassigned (${extras.unassigned})` }] : []),
    ...(extras.warrantyClaim !== undefined ? [{ value: TICKET_FILTER_WARRANTY_CLAIM, label: `Warranty Claim (${extras.warrantyClaim})` }] : []),
    ...TICKET_STATUSES.map((s) => ({ value: s, label: `${ticketStatusDisplay(s).label} (${counts[s] ?? 0})` })),
  ];
}

/** `groupBy({ by: ["status"] })` rows → counts per status. */
export function statusCounts(rows: { status: TicketStatus; _count: { _all: number } }[]): Partial<Record<TicketStatus, number>> {
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

/**
 * The technician and Sales lists' default: what needs the person's hands
 * first — work in progress, then waiting, then the handover steps — newest
 * first within each (sprint P5).
 */
export const PRIORITY_SORT = "priority";
const STATUS_PRIORITY: Partial<Record<TicketStatus, number>> = {
  on_progress: 1,
  waiting: 2,
  ready_for_pickup: 3,
  waiting_pickup: 3,
  handed_to_courier: 3,
  done: 4,
  delivered: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

type MemoryTicket = {
  ticket_code: string;
  ticket_type: string;
  status: TicketStatus;
  updated_at: Date;
  is_for_self: boolean;
  customer_name: string | null;
  user: { name: string } | null;
};

/**
 * Sorts a list the page loaded whole (the technician and Sales lists page in
 * memory). `extra` adds columns only that page knows — its points. Anything not
 * recognised is the priority order.
 */
export function sortTicketsInMemory<T extends MemoryTicket>(
  rows: readonly T[],
  sort: string,
  extra: Record<string, (row: T) => SortValue> = {},
): T[] {
  const values: Record<string, (row: T) => SortValue> = {
    code: (t) => t.ticket_code,
    type: (t) => t.ticket_type,
    customer: (t) => (t.is_for_self ? t.user?.name : t.customer_name) ?? t.user?.name,
    status: (t) => TICKET_STATUSES.indexOf(t.status),
    updated: (t) => t.updated_at,
    ...extra,
  };
  const m = /^(.+)_(asc|desc)$/.exec(sort);
  if (m && values[m[1]]) return sortRows(rows, { key: m[1], dir: m[2] as "asc" | "desc" }, values);
  return [...rows].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    return pa - pb || b.updated_at.getTime() - a.updated_at.getTime();
  });
}

/** The sort a priority-ordered list shows as active: none. */
export function memorySortState(sort: string): SortState {
  const m = /^(.+)_(asc|desc)$/.exec(sort);
  return m ? { key: m[1], dir: m[2] as "asc" | "desc" } : { key: "", dir: "asc" };
}
