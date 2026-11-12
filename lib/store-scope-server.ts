import "server-only";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import type { PageCapability } from "@/lib/access";
import { db } from "@/lib/db";
import { storesFor, type DashboardStore } from "@/lib/store-dashboard-server";

/**
 * Who may open the kepala toko's pages, and over which stores: a kepala toko
 * their own (StoreSupervisorAssignment), an administrator every active store.
 * Every /toko page starts here, and every query it runs is limited to `ids`.
 */
export async function requireStoreViewer(...pages: PageCapability[]) {
  const session = await requireRole("StoreSupervisor", "Administrator");
  // Which of the kepala toko's pages, from Pengaturan Akses → Halaman & Menu.
  if (pages.length) {
    const access = await accessFor(session.userId);
    if (!pages.some((p) => access.can(p))) redirect("/unauthorized");
  }
  const stores = await storesFor(session);
  return { session, stores };
}

/**
 * The stores a page shows: the one picked in `?store=` when the viewer may see
 * it, else all of theirs. A store id that is not theirs is ignored rather
 * than obeyed.
 */
export function pickStores(stores: DashboardStore[], storeParam: string | undefined) {
  const chosen = stores.find((s) => s.id === storeParam);
  const shown = chosen ? [chosen] : stores;
  return { chosen, shown, ids: shown.map((s) => s.id) };
}

/** Whether the ticket belongs to one of the viewer's stores. */
export async function ticketInStores(ticketIdOrCode: string, storeIds: string[]): Promise<string | null> {
  if (storeIds.length === 0) return null;
  const t = await db.ticket.findFirst({
    where: { OR: [{ id: ticketIdOrCode }, { ticket_code: ticketIdOrCode }], store_location_id: { in: storeIds } },
    select: { id: true },
  });
  return t?.id ?? null;
}

export type StoreScope = {
  /** The stores this person may pick from. */
  stores: { id: string; name: string }[];
  /** The stores their data is limited to; null = every store. */
  ids: string[] | null;
};

/**
 * Which stores' data a shared page shows this person (RBAC, 2026-11-11). A
 * kepala toko granted a page in Hak Akses — Rakitan PC, Part Keluar — sees
 * the stores they hold, as on their own pages; everyone else every store.
 */
export async function storeScopeFor(session: { userId: string; role: string }): Promise<StoreScope> {
  if (session.role === "StoreSupervisor") {
    const stores = await storesFor(session);
    return { stores, ids: stores.map((s) => s.id) };
  }
  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { stores, ids: null };
}

/**
 * The stores a query is limited to: the one picked when it is in scope, else
 * the whole scope. Undefined = no limit. A picked store outside the scope is
 * ignored rather than obeyed.
 */
export function scopedStoreIds(scope: StoreScope, picked: string | undefined | null): string[] | undefined {
  if (picked && scope.stores.some((s) => s.id === picked)) return [picked];
  return scope.ids ?? undefined;
}

/** Whether a ticket's store is in the scope (an unrestricted scope holds every ticket). */
export function inScope(scope: StoreScope, storeId: string | null): boolean {
  return scope.ids === null || (storeId !== null && scope.ids.includes(storeId));
}

/** A ticket filter for the scope; empty for an unrestricted one. */
export function storeWhere(scope: StoreScope): { store_location_id?: { in: string[] } } {
  return scope.ids ? { store_location_id: { in: scope.ids } } : {};
}
