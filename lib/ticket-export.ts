import type { CustomerType, PickupMethod, Prisma, TicketType } from "@prisma/client";
import { DEVICE_TYPE_LABELS } from "@/lib/rma/device";
import { rmaStatusDisplay, ticketStatusDisplay } from "@/lib/status-display";
import { ticketPartyName } from "@/lib/ticket-party";
import type { XlsxCell, XlsxColumn, XlsxSheet } from "@/lib/xlsx";

/**
 * The All Tickets spreadsheet: which columns it has and what goes in each.
 *
 * Pure — the route loads the rows with `TICKET_EXPORT_SELECT` and hands them
 * here, so the sheet's content is testable without a database.
 *
 * Deliberately left out: harga modal (cost visibility is a setting, and a file
 * that leaves the app cannot be held to it), RMA vendor fields and notes (the
 * desk's internal record), and the rich-text ticket notes (HTML).
 */

export const TICKET_EXPORT_SELECT = {
  ticket_code: true,
  created_at: true,
  updated_at: true,
  ticket_type: true,
  status: true,
  device_type: true,
  device_name: true,
  device_sku: true,
  device_brand: true,
  device_sn: true,
  accessories: true,
  device_condition: true,
  is_for_self: true,
  customer_name: true,
  customer_phone: true,
  customer_email: true,
  customer_type: true,
  pickup_method: true,
  technician_id: true,
  work_started_at: true,
  work_completed_at: true,
  user: { select: { name: true } },
  technician: { select: { name: true } },
  sales: { select: { name: true } },
  store_location: { select: { name: true } },
  rma_case: { select: { status: true } },
  charges: { select: { quantity: true, unit_price: true } },
} satisfies Prisma.TicketSelect;

export type TicketExportRow = Prisma.TicketGetPayload<{ select: typeof TICKET_EXPORT_SELECT }>;

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  service: "Service",
  warranty_claim: "Klaim Garansi",
  pc_build: "Rakit PC",
  cleaning: "Cleaning",
  upgrade: "Upgrade",
};

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  User: "Perorangan",
  Internet_Cafe: "Warnet",
  Company: "Perusahaan",
  Dealer: "Dealer",
};

const PICKUP_LABELS: Record<PickupMethod, string> = {
  self_pickup: "Ambil Sendiri",
  courier: "Kurir",
};

/**
 * The bill's selling total, and whether every line has a price.
 * `complete` is null for a ticket with no lines at all — nothing to judge.
 */
export function chargeTotals(charges: readonly { quantity: number; unit_price: number | null }[]): {
  total: number | null;
  complete: boolean | null;
} {
  if (charges.length === 0) return { total: null, complete: null };
  let total = 0;
  let complete = true;
  for (const c of charges) {
    if (c.unit_price === null) complete = false;
    else total += c.unit_price * c.quantity;
  }
  return { total, complete };
}

type Column = XlsxColumn & { value: (t: TicketExportRow) => XlsxCell };

const COLUMNS: readonly Column[] = [
  { header: "Kode Tiket", width: 14, value: (t) => t.ticket_code },
  { header: "Tanggal Masuk", width: 17, value: (t) => t.created_at },
  { header: "Toko", width: 18, value: (t) => t.store_location?.name },
  { header: "Jenis Tiket", width: 14, value: (t) => TICKET_TYPE_LABELS[t.ticket_type] },
  {
    header: "Status",
    width: 22,
    value: (t) => ticketStatusDisplay(t.status, { hasTechnician: Boolean(t.technician_id) }).label,
  },
  { header: "Tahap RMA", width: 22, value: (t) => (t.rma_case ? rmaStatusDisplay(t.rma_case.status).label : null) },
  { header: "Customer", width: 24, value: (t) => ticketPartyName(t) },
  { header: "Tipe Customer", width: 14, value: (t) => CUSTOMER_TYPE_LABELS[t.customer_type] },
  { header: "No. HP", width: 16, value: (t) => t.customer_phone },
  { header: "Email", width: 24, value: (t) => t.customer_email },
  { header: "Jenis Perangkat", width: 15, value: (t) => DEVICE_TYPE_LABELS[t.device_type] },
  { header: "Nama Perangkat", width: 36, value: (t) => t.device_name },
  { header: "SKU", width: 14, value: (t) => t.device_sku },
  { header: "Brand", width: 14, value: (t) => t.device_brand },
  { header: "Serial Number", width: 18, value: (t) => t.device_sn },
  { header: "Teknisi", width: 18, value: (t) => t.technician?.name },
  { header: "Sales", width: 18, value: (t) => t.sales?.name },
  { header: "Pengambilan", width: 14, value: (t) => (t.pickup_method ? PICKUP_LABELS[t.pickup_method] : null) },
  { header: "Mulai Dikerjakan", width: 17, value: (t) => t.work_started_at },
  { header: "Selesai Dikerjakan", width: 17, value: (t) => t.work_completed_at },
  { header: "Terakhir Diperbarui", width: 17, value: (t) => t.updated_at },
  { header: "Total Biaya (Rp)", width: 16, format: "rupiah", value: (t) => chargeTotals(t.charges).total },
  {
    header: "Harga Lengkap",
    width: 14,
    value: (t) => {
      const { complete } = chargeTotals(t.charges);
      return complete === null ? null : complete ? "Ya" : "Belum";
    },
  },
  { header: "Kelengkapan", width: 28, value: (t) => t.accessories },
  { header: "Kondisi Unit", width: 28, value: (t) => t.device_condition },
];

export function ticketExportSheet(tickets: readonly TicketExportRow[]): XlsxSheet {
  return {
    name: "Tiket",
    columns: COLUMNS.map(({ header, width, format }) => ({ header, width, format })),
    rows: tickets.map((t) => COLUMNS.map((c) => c.value(t))),
  };
}

/** "tiket-hns-2026-11-02.xlsx", or "tiket-hns-done-2026-11-02.xlsx" under a chip. */
export function ticketExportFilename(now: Date, filter: string): string {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const tag = filter && filter !== "all" ? `-${filter.replace(/[^a-z0-9_]/gi, "")}` : "";
  return `tiket-hns${tag}-${day}.xlsx`;
}
