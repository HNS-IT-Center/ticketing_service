import "server-only";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { storesFor, type DashboardStore } from "@/lib/store-dashboard-server";

/**
 * Who may open the kepala toko's pages, and over which stores: a kepala toko
 * their own (StoreSupervisorAssignment), an administrator every active store.
 * Every /toko page starts here, and every query it runs is limited to `ids`.
 */
export async function requireStoreViewer() {
  const session = await requireRole("StoreSupervisor", "Administrator");
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
