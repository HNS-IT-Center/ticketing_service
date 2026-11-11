import "server-only";
import type { Prisma, RmaDecision, RmaStatus, TicketStatus, VendorLocation } from "@prisma/client";
import { db } from "@/lib/db";
import { CatalogUnavailableError, catalogCostAccess, getCatalogItemCost, type CostAccess } from "@/lib/catalog/hns-data";
import { vendorKeyOf, vendorSpan, type VendorClaim, type VendorSpan } from "@/lib/finance-claims";

/** A warranty claim on a unit from the shop's own stock — on the case, or at intake before handover. */
export const STORE_STOCK_CLAIM_WHERE: Prisma.TicketWhereInput = {
  ticket_type: "warranty_claim",
  OR: [
    { rma_case: { is: { unit_ownership: "store_stock" } } },
    { rma_case: { is: null }, warranty_detail: { is: { unit_ownership: "store_stock" } } },
  ],
};

export type StoreClaimRow = {
  ticketId: string;
  code: string;
  createdAt: Date;
  status: TicketStatus;
  store: string | null;
  device: string;
  brand: string | null;
  sku: string | null;
  sn: string | null;
  rmaCode: string | null;
  rmaStatus: RmaStatus | null;
  vendorKey: string;
  vendorName: string | null;
  vendorLocation: VendorLocation | null;
  supplierClaimNumber: string | null;
  stockOrigin: string | null;
  transferNumber: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decision: RmaDecision | null;
  receivedAt: Date | null;
  closedAt: Date | null;
  span: VendorSpan | null;
  /** The unit's Accurate item, when it was picked from the catalogue. */
  catalogItemId: number | null;
  /** Harga modal per unit; null until withUnitCosts fills it, or when unknown. */
  unitCost: number | null;
};

export type StoreClaimFilter = {
  storeId?: string;
  vendorKey?: string;
  q?: string;
  /** Sent to the vendor in [start, end) — for the vendor table. */
  sentStart?: Date;
  sentEnd?: Date;
  /** Claim opened in [start, end) — for the list, which also holds claims not sent yet. */
  createdStart?: Date;
  createdEnd?: Date;
};

/** Every store-stock claim matching the filter, slowest at the vendor first. */
export async function loadStoreClaims(f: StoreClaimFilter, now: number): Promise<StoreClaimRow[]> {
  const q = f.q?.trim();
  const and: Prisma.TicketWhereInput[] = [STORE_STOCK_CLAIM_WHERE];
  if (f.storeId) and.push({ store_location_id: f.storeId });
  if (f.sentStart && f.sentEnd) and.push({ rma_case: { is: { submitted_at: { gte: f.sentStart, lt: f.sentEnd } } } });
  if (f.createdStart && f.createdEnd) and.push({ created_at: { gte: f.createdStart, lt: f.createdEnd } });
  if (q) {
    and.push({
      OR: [
        { ticket_code: { contains: q } },
        { device_name: { contains: q } },
        { device_sku: { contains: q } },
        { device_sn: { contains: q } },
        { rma_case: { is: { rma_code: { contains: q } } } },
        { rma_case: { is: { vendor_name: { contains: q } } } },
        { rma_case: { is: { vendor_rma_number: { contains: q } } } },
      ],
    });
  }

  const tickets = await db.ticket.findMany({
    where: { AND: and },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      ticket_code: true,
      created_at: true,
      status: true,
      device_name: true,
      device_type: true,
      device_brand: true,
      device_sku: true,
      device_sn: true,
      device_catalog_item_id: true,
      store_location: { select: { name: true } },
      rma_case: {
        select: {
          rma_code: true,
          status: true,
          vendor_id: true,
          vendor_name: true,
          vendor: { select: { name: true, location: true } },
          vendor_rma_number: true,
          stock_origin: true,
          stock_transfer_number: true,
          submitted_at: true,
          decided_at: true,
          decision: true,
          unit_received_at: true,
          closed_at: true,
        },
      },
    },
  });

  const rows = tickets.map((t): StoreClaimRow => {
    const c = t.rma_case;
    const timing = c
      ? { status: c.status, submittedAt: c.submitted_at, decidedAt: c.decided_at, receivedAt: c.unit_received_at, closedAt: c.closed_at }
      : null;
    return {
      ticketId: t.id,
      code: t.ticket_code,
      createdAt: t.created_at,
      status: t.status,
      store: t.store_location?.name ?? null,
      device: t.device_name?.trim() || t.device_type.replace(/_/g, " "),
      brand: t.device_brand,
      sku: t.device_sku,
      sn: t.device_sn?.trim() || null,
      rmaCode: c?.rma_code ?? null,
      rmaStatus: c?.status ?? null,
      vendorKey: vendorKeyOf(c?.vendor_id ?? null, c?.vendor_name ?? null),
      vendorName: c?.vendor?.name ?? c?.vendor_name ?? null,
      vendorLocation: c?.vendor?.location ?? null,
      supplierClaimNumber: c?.vendor_rma_number ?? null,
      stockOrigin: c?.stock_origin ?? null,
      transferNumber: c?.stock_transfer_number ?? null,
      submittedAt: c?.submitted_at ?? null,
      decidedAt: c?.decided_at ?? null,
      decision: c?.decision ?? null,
      receivedAt: c?.unit_received_at ?? null,
      closedAt: c?.closed_at ?? null,
      span: timing ? vendorSpan(timing, now) : null,
      catalogItemId: t.device_catalog_item_id,
      unitCost: null,
    };
  });
  return rows.sort((a, b) => (b.span?.days ?? -1) - (a.span?.days ?? -1) || +b.createdAt - +a.createdAt);
}

/** The same rows, in the shape the vendor table is computed from. */
export function asVendorClaims(rows: readonly StoreClaimRow[]): VendorClaim[] {
  return rows.flatMap((r) =>
    r.submittedAt && r.rmaStatus
      ? [
          {
            vendorKey: r.vendorKey,
            vendorName: r.vendorName ?? "Vendor tidak dicatat",
            decision: r.decision,
            status: r.rmaStatus,
            submittedAt: r.submittedAt,
            decidedAt: r.decidedAt,
            receivedAt: r.receivedAt,
            closedAt: r.closedAt,
          },
        ]
      : [],
  );
}

/**
 * Fills each row's harga modal from the Accurate catalogue, by the unit's item
 * id. Only for a viewer allowed `view_cost`. Asks once per distinct item, a few
 * at a time; the catalogue client caches each answer for a minute. When the
 * API cannot give costs the rows come back unchanged, with the reason.
 */
export async function withUnitCosts(rows: StoreClaimRow[]): Promise<{ rows: StoreClaimRow[]; cost: CostAccess }> {
  const cost = await catalogCostAccess();
  if (cost !== "ok") return { rows, cost };
  const ids = [...new Set(rows.map((r) => r.catalogItemId).filter((id): id is number => id !== null))];
  const costs = new Map<number, number | null>();
  try {
    for (let i = 0; i < ids.length; i += 5) {
      const batch = ids.slice(i, i + 5);
      const got = await Promise.all(batch.map((id) => getCatalogItemCost(id)));
      batch.forEach((id, j) => costs.set(id, got[j]));
    }
  } catch (err) {
    if (err instanceof CatalogUnavailableError) return { rows, cost: "unavailable" };
    throw err;
  }
  return { rows: rows.map((r) => ({ ...r, unitCost: r.catalogItemId === null ? null : (costs.get(r.catalogItemId) ?? null) })), cost };
}
