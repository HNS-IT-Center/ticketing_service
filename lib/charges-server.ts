import "server-only";
import type { ChargeKind, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import { mayEditCharges, type ChargePermissions, type ChargeRow, type VendorOption } from "@/lib/charges";

export type { ChargePermissions, ChargeRow, VendorOption };

type TicketScope = {
  technician_id: string | null;
  sales_id: string | null;
  store_location_id: string | null;
  status: TicketStatus;
};

/**
 * What this person may do with this ticket's bill.
 *
 * Seeing the margin also requires seeing the cost: margin and total together
 * give the cost away, so granting one without the other would be a leak, not a
 * setting. The same for setting a cost one may not see.
 */
export async function chargePermissions(userId: string, ticket: TicketScope): Promise<ChargePermissions> {
  const access = await accessFor(userId);
  const coordinatorStoreIds = access.audiences.includes("coordinator")
    ? (
        await db.technicianStoreAssignment.findMany({
          where: { technician_id: userId },
          select: { store_id: true },
        })
      ).map((r) => r.store_id)
    : [];
  const canEdit = mayEditCharges({ userId, audiences: access.audiences, coordinatorStoreIds, ticket });
  const canViewCost = access.can("view_cost");
  return {
    canEdit,
    canEditPrice: canEdit && access.can("edit_price"),
    canEditCost: canEdit && canViewCost && access.can("edit_cost"),
    canViewCost,
    canViewMargin: canViewCost && access.can("view_margin"),
    canPrintInvoice: access.can("print_invoice"),
  };
}

const KIND_ORDER: Record<ChargeKind, number> = { part: 0, external_service: 1, service_fee: 2, other: 3 };

/**
 * A ticket's bill, ready for a client component. The cost is removed here, on
 * the server, when the viewer may not see it — hiding it in the browser would
 * still send it there.
 */
export async function loadTicketCharges(ticketId: string, canViewCost: boolean): Promise<ChargeRow[]> {
  const rows = await db.ticketCharge.findMany({
    where: { ticket_id: ticketId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      kind: true,
      description: true,
      quantity: true,
      unit_price: true,
      unit_cost: true,
      replaced_part_id: true,
      sent_at: true,
      returned_at: true,
      external_result: true,
      external_note: true,
      vendor: { select: { id: true, name: true } },
      created_by: { select: { name: true } },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      ...(canViewCost ? { unit_cost: r.unit_cost } : {}),
      vendor: r.vendor,
      is_part: r.replaced_part_id !== null,
      sent_at: r.sent_at?.toISOString() ?? null,
      returned_at: r.returned_at?.toISOString() ?? null,
      external_result: r.external_result,
      external_note: r.external_note,
      created_by_name: r.created_by.name,
    }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function activeVendors(): Promise<VendorOption[]> {
  return db.vendor.findMany({
    where: { is_active: true },
    select: { id: true, name: true, kind: true },
    orderBy: { name: "asc" },
  });
}

/** True while some work of this ticket is at a vendor and has not come back. */
export async function hasExternalWorkOutstanding(ticketId: string): Promise<boolean> {
  const count = await db.ticketCharge.count({
    where: { ticket_id: ticketId, kind: "external_service", sent_at: { not: null }, returned_at: null },
  });
  return count > 0;
}

/**
 * Everything the Rincian Biaya panel needs, or null for a ticket that has no
 * bill. One call per ticket page, so the three portals cannot disagree about
 * who sees what.
 */
export async function loadChargesPanel(
  userId: string,
  ticket: TicketScope & { id: string; ticket_type: string },
): Promise<{ perms: ChargePermissions; lines: ChargeRow[]; vendors: VendorOption[] } | null> {
  if (ticket.ticket_type !== "service") return null;
  const perms = await chargePermissions(userId, ticket);
  const [lines, vendors] = await Promise.all([
    loadTicketCharges(ticket.id, perms.canViewCost),
    perms.canEdit ? activeVendors() : Promise.resolve([]),
  ]);
  return { perms, lines, vendors };
}
