import type { Prisma, RmaStatus, UnitOwnership } from "@prisma/client";
import { isTerminalRmaStatus } from "@/lib/rma/state-machine";
import { isAdminRole } from "@/lib/admin-roles";

/**
 * "Ubah kepemilikan" on an RMA case (owner, 2026-11-25): a customer's claim
 * becomes the shop's own — typically the shop swaps the customer's unit with
 * one from stock because the distributor agreed to replace it — or back, when
 * it was entered wrong. Pure: the actions load and write.
 *
 * RMA — and Admin / Owner (owner, 2026-11-25) — change the ownership with a
 * reason; nothing waits on anyone and the store's kepala toko is told. The
 * same people then fill the stock data of a case switched to store stock
 * (Asal stok, Nomor Pemindahan Stok) from the case page, whenever they have
 * it: the transfer number the desk is normally asked on the way to verified
 * is not demanded of such a case.
 *
 * A claim opened as store stock keeps the old rule (origin at intake, number
 * asked by the desk at verification).
 */

export const OWNERSHIP_TEXT: Record<UnitOwnership, string> = { customer: "Klaim User", store_stock: "Klaim Toko" };

const MAX_TEXT = 500;
const MAX_CODE = 191;

/**
 * How a switch to store stock begins its RmaEvent note. The event is the
 * record that a case was switched, so the note's opening is fixed: it is
 * matched with `startsWith`.
 */
export const SWITCHED_TO_STORE_NOTE = `Kepemilikan diubah: ${OWNERSHIP_TEXT.customer} → ${OWNERSHIP_TEXT.store_stock}`;

/** A store-stock case RMA switched there: its stock data is filled from the case page, later. */
export const SWITCHED_TO_STORE_WHERE = {
  unit_ownership: "store_stock",
  events: { some: { note: { startsWith: SWITCHED_TO_STORE_NOTE } } },
} satisfies Prisma.RmaCaseWhereInput;

/** …and it has not been filled in yet. */
export const STOCK_DATA_PENDING_WHERE = {
  ...SWITCHED_TO_STORE_WHERE,
  OR: [{ stock_origin: null }, { stock_origin: "" }, { stock_transfer_number: null }, { stock_transfer_number: "" }],
} satisfies Prisma.RmaCaseWhereInput;

const blank = (s: string | null | undefined) => !(s ?? "").trim();

/** The same test as SWITCHED_TO_STORE_WHERE, on a case already loaded with its event notes. */
export function isSwitchedToStore(ownership: UnitOwnership, events: readonly { note: string | null }[]): boolean {
  return ownership === "store_stock" && events.some((e) => e.note?.startsWith(SWITCHED_TO_STORE_NOTE));
}

export function stockDataPending(c: { stock_origin: string | null; stock_transfer_number: string | null }): boolean {
  return blank(c.stock_origin) || blank(c.stock_transfer_number);
}

export type OwnershipChangeInput = {
  role: string;
  status: RmaStatus;
  current: UnitOwnership;
  next: string | null;
  reason: string | null;
};

export type OwnershipChange = { ok: true; next: UnitOwnership; reason: string } | { ok: false; error: string };

export function validateOwnershipChange(input: OwnershipChangeInput): OwnershipChange {
  if (input.role !== "RMA" && !isAdminRole(input.role)) {
    return { ok: false, error: "Hanya RMA, Admin, dan Owner yang dapat mengubah kepemilikan unit." };
  }
  if (isTerminalRmaStatus(input.status)) return { ok: false, error: "Case sudah selesai, kepemilikan tidak dapat diubah lagi." };
  if (input.next !== "customer" && input.next !== "store_stock") return { ok: false, error: "Pilih Klaim User atau Klaim Toko." };
  if (input.next === input.current) return { ok: false, error: `Case ini sudah ${OWNERSHIP_TEXT[input.current]}.` };

  const reason = (input.reason ?? "").trim();
  if (!reason) return { ok: false, error: "Alasan wajib diisi." };
  if (reason.length > MAX_TEXT) return { ok: false, error: `Alasan maksimal ${MAX_TEXT} karakter.` };
  return { ok: true, next: input.next, reason };
}

/**
 * The line written to the RMA history and the activity log. A switch clears
 * the stock data (filled again afterwards for store stock; a customer's unit
 * has none), so what was cleared is kept here.
 */
export function ownershipChangeNote(
  from: UnitOwnership,
  to: UnitOwnership,
  reason: string,
  cleared: { stock_origin: string | null; stock_transfer_number: string | null } = { stock_origin: null, stock_transfer_number: null },
): string {
  const old = [
    !blank(cleared.stock_origin) && `asal stok ${cleared.stock_origin}`,
    !blank(cleared.stock_transfer_number) && `nomor pemindahan ${cleared.stock_transfer_number}`,
  ].filter(Boolean);
  const was = old.length ? ` (sebelumnya ${old.join(", ")})` : "";
  return `Kepemilikan diubah: ${OWNERSHIP_TEXT[from]} → ${OWNERSHIP_TEXT[to]}. Alasan: ${reason}${was}`;
}

export type StockDataInput = { role: string; switched: boolean; stockOrigin: string | null; transferNumber: string | null };
export type StockData = { ok: true; stockOrigin: string; transferNumber: string } | { ok: false; error: string };

/** RMA (or Admin / Owner) fills — or corrects — a switched case's stock data. Both fields, together. */
export function validateStockData(input: StockDataInput): StockData {
  if (input.role !== "RMA" && !isAdminRole(input.role)) {
    return { ok: false, error: "Hanya RMA, Admin, dan Owner yang dapat mengisi data stok klaim ini." };
  }
  if (!input.switched) return { ok: false, error: "Data stok di sini hanya untuk klaim yang diubah RMA menjadi Klaim Toko." };
  const origin = (input.stockOrigin ?? "").trim();
  const transfer = (input.transferNumber ?? "").trim();
  if (!origin) return { ok: false, error: "Asal stok wajib diisi." };
  if (!transfer) return { ok: false, error: "Nomor Pemindahan Stok wajib diisi." };
  if (origin.length > MAX_TEXT) return { ok: false, error: `Asal stok maksimal ${MAX_TEXT} karakter.` };
  if (transfer.length > MAX_CODE) return { ok: false, error: "Nomor Pemindahan Stok terlalu panjang." };
  return { ok: true, stockOrigin: origin, transferNumber: transfer };
}
