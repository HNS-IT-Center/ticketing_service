import "server-only";
import type { ChargeKind, ServicePart, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import { mayEditCharges, type ChargePermissions, type ChargeRow, type VendorOption } from "@/lib/charges";
import type { ServiceJobOption } from "@/lib/service-jobs";
import { priceReference, type PriceSample } from "@/lib/price-reference";

export type { ChargePermissions, ChargeRow, VendorOption, ServiceJobOption };

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
export async function loadTicketCharges(
  ticketId: string,
  canViewCost: boolean,
  /** Add what each part usually sells for — for whoever sets selling prices. */
  withPriceReferences = false
): Promise<ChargeRow[]> {
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
      replaced_part: { select: { part: true, sku: true, item_name: true } },
      sent_at: true,
      returned_at: true,
      external_result: true,
      external_note: true,
      vendor: { select: { id: true, name: true } },
      service_job: { select: { id: true, name: true, accurate_sku: true } },
      job_points: true,
      created_by: { select: { name: true } },
    },
  });
  const samples = withPriceReferences
    ? await loadPriceSamples(rows.flatMap((r) => (r.replaced_part ? [r.replaced_part.part] : [])))
    : [];
  return rows
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      ...(canViewCost ? { unit_cost: r.unit_cost } : {}),
      vendor: r.vendor,
      service_job: r.service_job ? { id: r.service_job.id, name: r.service_job.name } : null,
      job_points: r.job_points,
      accurate_code: r.replaced_part ? r.replaced_part.sku : (r.service_job?.accurate_sku ?? null),
      is_part: r.replaced_part_id !== null,
      sent_at: r.sent_at?.toISOString() ?? null,
      returned_at: r.returned_at?.toISOString() ?? null,
      external_result: r.external_result,
      external_note: r.external_note,
      created_by_name: r.created_by.name,
      ...(withPriceReferences && r.replaced_part
        ? {
            price_reference: priceReference(
              { chargeId: r.id, part: r.replaced_part.part, sku: r.replaced_part.sku, name: r.replaced_part.item_name },
              samples
            ),
          }
        : {}),
    }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** Parts priced on any bill over the last year, of the categories asked about. */
const REFERENCE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

async function loadPriceSamples(categories: ServicePart[]): Promise<PriceSample[]> {
  if (categories.length === 0) return [];
  const rows = await db.ticketCharge.findMany({
    where: {
      kind: "part",
      unit_price: { not: null },
      created_at: { gte: new Date(Date.now() - REFERENCE_WINDOW_MS) },
      replaced_part: { part: { in: [...new Set(categories)] } },
    },
    orderBy: { created_at: "desc" },
    take: 2000,
    select: { id: true, unit_price: true, created_at: true, replaced_part: { select: { part: true, sku: true, item_name: true } } },
  });
  return rows.flatMap((r) =>
    r.replaced_part && r.unit_price !== null
      ? [{ chargeId: r.id, part: r.replaced_part.part, sku: r.replaced_part.sku, name: r.replaced_part.item_name, price: r.unit_price, at: r.created_at }]
      : []
  );
}

export function activeVendors(): Promise<VendorOption[]> {
  return db.vendor.findMany({
    where: { is_active: true, OR: [{ supplies_parts: true }, { repairs: true }] },
    select: { id: true, name: true, supplies_parts: true, repairs: true },
    orderBy: { name: "asc" },
  });
}

/** The jobs a "Jasa service" line may be for. */
export function activeServiceJobs(): Promise<ServiceJobOption[]> {
  return db.serviceJob.findMany({
    where: { is_active: true },
    select: { id: true, name: true, default_price: true, points: true },
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
): Promise<{
  perms: ChargePermissions;
  lines: ChargeRow[];
  vendors: VendorOption[];
  serviceJobs: ServiceJobOption[];
} | null> {
  if (ticket.ticket_type !== "service") return null;
  const perms = await chargePermissions(userId, ticket);
  const [lines, vendors, serviceJobs] = await Promise.all([
    loadTicketCharges(ticket.id, perms.canViewCost, perms.canEditPrice),
    perms.canEdit ? activeVendors() : Promise.resolve([]),
    perms.canEdit ? activeServiceJobs() : Promise.resolve([]),
  ]);
  return { perms, lines, vendors, serviceJobs };
}
