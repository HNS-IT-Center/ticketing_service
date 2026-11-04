import type { Prisma, RmaHoldReason, UnitOwnership } from "@prisma/client";
import { RMA_DECISION_LABELS } from "@/lib/rma/decision";
import { holdReasonMeta } from "@/lib/rma/hold-reason";
import { rmaStatusDisplay, ticketStatusDisplay } from "@/lib/status-display";
import { STORE_STOCK_LABEL, ticketPartyName } from "@/lib/ticket-party";
import { vendorLocationText } from "@/lib/vendors";
import type { XlsxCell, XlsxColumn, XlsxSheet } from "@/lib/xlsx";

/**
 * The RMA desk's claim spreadsheet: one row per claim on the Klaim Garansi
 * list, with the case's whole path — handover, hold, vendor, decision, close.
 *
 * Internal by construction: it carries the vendor's claim number, the desk's
 * notes and the decision notes, which the public customer page must never
 * show. The route that serves it admits the RMA desk and administrators only.
 *
 * Pure — the route loads with `CLAIM_EXPORT_SELECT` and passes the clock in,
 * so "Lama Proses" of an open case is testable.
 */

export const CLAIM_EXPORT_SELECT = {
  ticket_code: true,
  created_at: true,
  status: true,
  technician_id: true,
  is_for_self: true,
  customer_name: true,
  customer_phone: true,
  ticket_type: true,
  device_name: true,
  device_sku: true,
  device_brand: true,
  device_sn: true,
  user: { select: { name: true } },
  technician: { select: { name: true } },
  store_location: { select: { name: true } },
  warranty_detail: { select: { purchase_date: true, unit_ownership: true, stock_origin: true } },
  rma_case: {
    select: {
      rma_code: true,
      status: true,
      unit_ownership: true,
      stock_origin: true,
      fault_description: true,
      handed_over_at: true,
      recommended_eligible: true,
      handler: { select: { name: true } },
      hold_reason_code: true,
      hold_reason: true,
      vendor_name: true,
      vendor: { select: { location: true } },
      vendor_rma_number: true,
      customer_ticket_number: true,
      shipping_tracking: true,
      submitted_at: true,
      decision: true,
      decision_notes: true,
      replacement_sn: true,
      decided_at: true,
      unit_received_at: true,
      closed_at: true,
    },
  },
} satisfies Prisma.TicketSelect;

export type ClaimExportRow = Prisma.TicketGetPayload<{ select: typeof CLAIM_EXPORT_SELECT }>;

const OWNERSHIP_LABELS: Record<UnitOwnership, string> = {
  customer: "Milik Customer",
  store_stock: STORE_STOCK_LABEL,
};

const DAY_MS = 86_400_000;

/**
 * Whole days the desk has had the claim: handover to close, or to `now` while
 * it is still open. Null before handover — the desk has not had it at all.
 */
export function claimDays(
  c: { handed_over_at: Date; closed_at: Date | null } | null,
  now: Date,
): number | null {
  if (!c) return null;
  const end = c.closed_at ?? now;
  return Math.max(0, Math.floor((end.getTime() - c.handed_over_at.getTime()) / DAY_MS));
}

function recommendationLabel(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Layak klaim" : "Tidak layak klaim";
}

function holdText(code: RmaHoldReason | null, note: string | null): string | null {
  if (!code) return null;
  const label = holdReasonMeta(code).label;
  return note?.trim() ? `${label} — ${note.trim()}` : label;
}

type Column = XlsxColumn & { value: (t: ClaimExportRow, now: Date) => XlsxCell };

const COLUMNS: readonly Column[] = [
  { header: "Kode Tiket", width: 14, value: (t) => t.ticket_code },
  { header: "Kode RMA", width: 20, value: (t) => t.rma_case?.rma_code ?? "belum diserahkan" },
  { header: "Tanggal Masuk", width: 17, value: (t) => t.created_at },
  { header: "Toko", width: 18, value: (t) => t.store_location?.name },
  { header: "Customer", width: 24, value: (t) => ticketPartyName(t) },
  { header: "No. HP", width: 16, value: (t) => t.customer_phone },
  {
    header: "Kepemilikan Unit",
    width: 16,
    value: (t) => {
      const o = t.rma_case?.unit_ownership ?? t.warranty_detail?.unit_ownership;
      return o ? OWNERSHIP_LABELS[o] : null;
    },
  },
  { header: "Asal Stok", width: 20, value: (t) => t.rma_case?.stock_origin ?? t.warranty_detail?.stock_origin },
  { header: "Brand", width: 14, value: (t) => t.device_brand },
  { header: "Nama Barang", width: 36, value: (t) => t.device_name },
  { header: "SKU", width: 14, value: (t) => t.device_sku },
  { header: "Serial Number", width: 18, value: (t) => t.device_sn },
  { header: "Tanggal Pembelian", width: 17, value: (t) => t.warranty_detail?.purchase_date },
  { header: "Keluhan", width: 36, value: (t) => t.rma_case?.fault_description },
  {
    header: "Status Tiket",
    width: 20,
    value: (t) => ticketStatusDisplay(t.status, { hasTechnician: Boolean(t.technician_id) }).label,
  },
  { header: "Tahap RMA", width: 20, value: (t) => (t.rma_case ? rmaStatusDisplay(t.rma_case.status).label : null) },
  { header: "Teknisi", width: 18, value: (t) => t.technician?.name },
  { header: "Rekomendasi Teknisi", width: 18, value: (t) => recommendationLabel(t.rma_case?.recommended_eligible ?? null) },
  { header: "Diserahkan ke RMA", width: 17, value: (t) => t.rma_case?.handed_over_at },
  { header: "PIC RMA", width: 18, value: (t) => t.rma_case?.handler?.name },
  {
    header: "Alasan Ditahan",
    width: 30,
    value: (t) => (t.rma_case ? holdText(t.rma_case.hold_reason_code, t.rma_case.hold_reason) : null),
  },
  { header: "Vendor", width: 24, value: (t) => t.rma_case?.vendor_name },
  { header: "Lokasi Vendor", width: 16, value: (t) => vendorLocationText(t.rma_case?.vendor?.location) },
  { header: "No. Klaim Pemasok", width: 18, value: (t) => t.rma_case?.vendor_rma_number },
  { header: "No. Tiket Customer", width: 18, value: (t) => t.rma_case?.customer_ticket_number },
  { header: "No. Resi", width: 18, value: (t) => t.rma_case?.shipping_tracking },
  { header: "Dikirim ke Vendor", width: 17, value: (t) => t.rma_case?.submitted_at },
  {
    header: "Keputusan Vendor",
    width: 18,
    value: (t) => (t.rma_case?.decision ? RMA_DECISION_LABELS[t.rma_case.decision] : null),
  },
  { header: "SN Pengganti", width: 18, value: (t) => t.rma_case?.replacement_sn },
  { header: "Catatan Keputusan", width: 30, value: (t) => t.rma_case?.decision_notes },
  { header: "Tanggal Keputusan", width: 17, value: (t) => t.rma_case?.decided_at },
  { header: "Unit Diterima", width: 17, value: (t) => t.rma_case?.unit_received_at },
  { header: "Selesai", width: 17, value: (t) => t.rma_case?.closed_at },
  { header: "Lama Proses (hari)", width: 12, value: (t, now) => claimDays(t.rma_case, now) },
];

export function claimExportSheet(claims: readonly ClaimExportRow[], now: Date): XlsxSheet {
  return {
    name: "Klaim Garansi",
    columns: COLUMNS.map(({ header, width, format }) => ({ header, width, format })),
    rows: claims.map((t) => COLUMNS.map((c) => c.value(t, now))),
  };
}

/** "klaim-garansi-2026-11-04.xlsx", or "klaim-garansi-rma_process-2026-11-04.xlsx" under a chip. */
export function claimExportFilename(now: Date, filter: string): string {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const tag = filter && filter !== "all" ? `-${filter.replace(/[^a-z0-9_]/gi, "")}` : "";
  return `klaim-garansi${tag}-${day}.xlsx`;
}
