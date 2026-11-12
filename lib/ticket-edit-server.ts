import "server-only";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";
import { isStoreStockClaim } from "@/lib/ticket-party";
import { notesToPlainText } from "@/lib/plain-text";
import type { TicketEditContext, TicketEditValues } from "@/lib/ticket-edit";
import type { PickedUnit } from "@/components/catalog/UnitField";

export const TICKET_EDIT_SELECT = {
  id: true,
  ticket_code: true,
  ticket_type: true,
  is_for_self: true,
  device_name: true,
  device_sn: true,
  accessories: true,
  device_condition: true,
  notes: true,
  customer_name: true,
  customer_phone: true,
  customer_email: true,
  customer_address: true,
  device_catalog_item_id: true,
  device_sku: true,
  device_catalog_category: true,
  device_brand: true,
  warranty_detail: { select: { unit_ownership: true } },
} as const;

type EditRow = {
  ticket_type: string;
  is_for_self: boolean;
  customer_name: string | null;
  warranty_detail: { unit_ownership: string | null } | null;
} & TicketEditValues & {
    device_catalog_item_id: number | null;
    device_sku: string | null;
    device_catalog_category: string | null;
    device_brand: string | null;
  };

export function editContextOf(t: EditRow): TicketEditContext {
  return {
    ticketType: t.ticket_type,
    isForSelf: t.is_for_self,
    storeStock: t.warranty_detail?.unit_ownership === "store_stock" || isStoreStockClaim(t),
  };
}

/**
 * The ticket's values as the dialog shows them. The keluhan is stored as HTML
 * and edited as text, so it is compared as text: a ticket nobody touched reads
 * back equal and is not rewritten.
 */
export function editValuesOf(t: TicketEditValues): TicketEditValues {
  return {
    device_name: t.device_name,
    device_sn: t.device_sn,
    accessories: t.accessories,
    device_condition: t.device_condition,
    notes: notesToPlainText(t.notes) || null,
    customer_name: t.customer_name,
    customer_phone: t.customer_phone,
    customer_email: t.customer_email,
    customer_address: t.customer_address,
  };
}

export type TicketEditProps = {
  ticketId: string;
  ticketCode: string;
  context: TicketEditContext;
  values: TicketEditValues;
  unit: PickedUnit | null;
  catalogEnabled: boolean;
};

/**
 * What the "Ubah data tiket" dialog needs, or null when this user may not
 * correct tickets (Pengaturan Akses → Tiket). A page renders the button only
 * when this is not null; the action checks the same setting again.
 */
export async function loadTicketEdit(userId: string, ticketId: string): Promise<TicketEditProps | null> {
  const access = await accessFor(userId);
  if (!access.can("edit_ticket")) return null;
  const t = await db.ticket.findUnique({ where: { id: ticketId }, select: TICKET_EDIT_SELECT });
  if (!t) return null;
  return {
    ticketId: t.id,
    ticketCode: t.ticket_code,
    context: editContextOf(t),
    values: editValuesOf(t),
    unit:
      t.device_catalog_item_id !== null && t.device_sku
        ? {
            id: t.device_catalog_item_id,
            sku: t.device_sku,
            name: t.device_name ?? t.device_sku,
            category: t.device_catalog_category,
            brand: t.device_brand,
          }
        : null,
    catalogEnabled: isCatalogConfigured(),
  };
}
