import "server-only";
import { db } from "@/lib/db";
import { currentMonth, monthRange, type PartReportRow } from "./parts";

/** The month asked for, or the current WIB month. The one clock read per request. */
export function resolveReportMonth(requested: string | null | undefined): string {
  return requested && monthRange(requested) ? requested : currentMonth(Date.now());
}

/** Replaced parts recorded in a WIB month, optionally for one store. */
export async function loadPartRows(month: string, storeId: string | null): Promise<PartReportRow[] | null> {
  const range = monthRange(month);
  if (!range) return null;
  return loadPartRowsBetween(range.start, range.end, storeId);
}

/** Replaced parts recorded in [start, end), optionally for one store. */
export async function loadPartRowsBetween(start: Date, end: Date, storeId: string | null): Promise<PartReportRow[]> {
  const rows = await db.ticketReplacedPart.findMany({
    where: {
      created_at: { gte: start, lt: end },
      ...(storeId ? { ticket: { store_location_id: storeId } } : {}),
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      created_at: true,
      part: true,
      item_name: true,
      sku: true,
      catalog_item_id: true,
      catalog_category: true,
      quantity: true,
      notes: true,
      recorded_by: { select: { name: true } },
      ticket: {
        select: { id: true, ticket_code: true, store_location: { select: { name: true } } },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    part: r.part,
    itemName: r.item_name,
    sku: r.sku,
    catalogItemId: r.catalog_item_id,
    catalogCategory: r.catalog_category,
    quantity: r.quantity,
    notes: r.notes,
    ticketId: r.ticket.id,
    ticketCode: r.ticket.ticket_code,
    storeName: r.ticket.store_location?.name ?? null,
    technicianName: r.recorded_by.name,
  }));
}
