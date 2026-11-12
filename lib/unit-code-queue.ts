import type { Prisma } from "@prisma/client";

/**
 * Lengkapi Kode Barang (owner, 2026-11-12): tickets whose unit was typed by
 * hand and so carry no Accurate SKU — which keeps a store-stock claim out of
 * Finance's money held at a vendor, and a claim out of the brand analysis.
 * Claims and service tickets only; for PC builds, cleaning and upgrades the
 * owner does not need it. A ticket created without a code later lands here on
 * its own, so the list is how the gap stays closed, not a one-off clean-up.
 */
export const UNIT_CODE_KINDS = ["stok", "klaim", "service"] as const;
export type UnitCodeKind = (typeof UNIT_CODE_KINDS)[number];

export const UNIT_CODE_LABELS: Record<UnitCodeKind, { label: string; hint: string }> = {
  stok: { label: "Klaim stok toko", hint: "Unit stok toko sendiri: tanpa kode, harga modalnya tidak masuk uang tertahan di Finance." },
  klaim: { label: "Klaim customer", hint: "Tanpa kode, klaimnya tidak masuk Analisa Klaim per brand dan jenis barang." },
  service: { label: "Service", hint: "Unit yang di-service. Lewati unit yang memang tidak dijual di toko." },
};

export function isUnitCodeKind(v: string | undefined | null): v is UnitCodeKind {
  return (UNIT_CODE_KINDS as readonly string[]).includes(v ?? "");
}

const NO_CODE: Prisma.TicketWhereInput = { OR: [{ device_sku: null }, { device_sku: "" }] };
const NOT_VOID: Prisma.TicketWhereInput = { status: { notIn: ["cancelled", "rejected"] } };
/** The shop's own unit: from the RMA case, else from the intake. */
const STORE_STOCK: Prisma.TicketWhereInput = {
  OR: [
    { rma_case: { is: { unit_ownership: "store_stock" } } },
    { rma_case: { is: null }, warranty_detail: { is: { unit_ownership: "store_stock" } } },
  ],
};

/** Tickets of one kind still without a code; a cancelled or rejected one is not worth the work. */
export function unitCodeWhere(kind: UnitCodeKind, q = ""): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [NO_CODE, NOT_VOID];
  if (kind === "service") and.push({ ticket_type: "service" });
  else {
    and.push({ ticket_type: "warranty_claim" });
    and.push(kind === "stok" ? STORE_STOCK : { NOT: STORE_STOCK });
  }
  const s = q.trim();
  if (s) {
    and.push({
      OR: [{ ticket_code: { contains: s } }, { device_name: { contains: s } }, { device_sn: { contains: s } }, { customer_name: { contains: s } }],
    });
  }
  return { AND: and };
}
