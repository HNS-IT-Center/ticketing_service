"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { logActivity } from "@/lib/activity";
import { CatalogUnavailableError, getCatalogItem } from "@/lib/catalog/hns-data";
import { NO_STOCK, type CatalogItem } from "@/lib/catalog/items";
import { catalogBrand } from "@/lib/catalog/brand";
import { describeChanges, diffTicketEdit, EDITABLE_FIELDS, parseTicketEdit, type EditableField } from "@/lib/ticket-edit";
import { editContextOf, editValuesOf, TICKET_EDIT_SELECT } from "@/lib/ticket-edit-server";

export type TicketEditResult = { ok: true; changed: number } | { ok: false; error: string };

/**
 * Correct a ticket's intake data: the unit (picked from the catalogue or
 * typed), SN, accessories, condition, and the customer's details. Any status —
 * a wrong unit name is as wrong on a completed ticket. Guarded by `edit_ticket`
 * (Admin → Pengaturan Akses), checked here and not only by the button.
 *
 * A picked unit is re-read from the catalogue by id, as at intake, so the name
 * and SKU on record are the catalogue's and not what the browser sent. Typing a
 * name over a picked unit drops its catalogue link — the record then says what
 * was typed, and nothing pretends it is the catalogue item.
 */
export async function updateTicketDetailsAction(ticketId: string, formData: FormData): Promise<TicketEditResult> {
  const session = await requireSession();
  const access = await accessFor(session.userId);
  if (!access.can("edit_ticket")) return { ok: false, error: "Anda tidak punya akses untuk mengubah data tiket." };

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: TICKET_EDIT_SELECT });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };

  const current = editValuesOf(ticket);
  const input: Partial<Record<EditableField, unknown>> = {};
  for (const f of EDITABLE_FIELDS) input[f] = formData.get(f);

  // The unit: the catalogue item the dialog holds, if any.
  const catalogRaw = ((formData.get("device_catalog_item_id") as string | null) || "").trim();
  let catalog: CatalogItem | null = null;
  let keepCatalog = false;
  if (catalogRaw) {
    const id = Number(catalogRaw);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Unit dari katalog tidak valid." };
    if (id === ticket.device_catalog_item_id) {
      keepCatalog = true; // unchanged: nothing to look up
    } else {
      try {
        catalog = await getCatalogItem(id, NO_STOCK);
      } catch (err) {
        if (!(err instanceof CatalogUnavailableError)) throw err;
        console.error("[TICKET EDIT] katalog", err.message);
        return { ok: false, error: "Katalog barang sedang tidak dapat dihubungi. Coba lagi, atau ketik nama unit secara manual." };
      }
      if (!catalog) return { ok: false, error: "Unit tidak ditemukan di katalog." };
      input.device_name = catalog.name;
    }
  }
  if (keepCatalog) input.device_name = ticket.device_name;

  const parsed = parseTicketEdit(input, current, editContextOf(ticket));
  if (!parsed.ok) return parsed;
  const changes = diffTicketEdit(current, parsed.values);

  // The catalogue link follows the unit: a new pick, kept, or dropped for typing.
  const catalogData = catalog
    ? {
        device_catalog_item_id: catalog.id,
        device_sku: catalog.sku,
        device_catalog_category: catalog.category,
        device_brand: catalogBrand(catalog),
      }
    : keepCatalog
      ? null
      : ticket.device_catalog_item_id !== null
        ? { device_catalog_item_id: null, device_sku: null, device_catalog_category: null, device_brand: null }
        : null;

  if (changes.length === 0 && !catalogData) return { ok: true, changed: 0 };

  await db.ticket.update({
    where: { id: ticket.id },
    data: { ...parsed.values, ...(catalogData ?? {}) },
  });

  const catalogNote = catalog
    ? `Unit dari katalog: SKU ${ticket.device_sku ?? "—"} → ${catalog.sku}`
    : catalogData
      ? `Tautan katalog dilepas (SKU ${ticket.device_sku}), nama diketik manual`
      : null;
  await logActivity(session, "ticket.edit", describeChanges(ticket.ticket_code, changes, catalogNote), {
    type: "ticket",
    id: ticket.id,
    label: ticket.ticket_code,
  });

  revalidatePath(`/admin/tickets/${ticket.id}`);
  revalidatePath(`/technician/tickets/${ticket.id}`);
  revalidatePath(`/sales/tickets/${ticket.id}`);
  revalidatePath("/rma/cases/[id]", "page");
  return { ok: true, changed: changes.length + (catalogData && changes.length === 0 ? 1 : 0) };
}
