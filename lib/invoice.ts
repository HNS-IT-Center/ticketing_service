/**
 * The service invoice — "Faktur Service" — the customer takes to the cashier.
 *
 * Pure: the bill's lines in, what the invoice prints out. It carries selling
 * prices only. Costs, margins and vendors are the shop's business and never
 * reach it: the page loads the lines without costs, and nothing here reads a
 * vendor.
 *
 * An invoice is a draft while a line has no price yet or work is still at a
 * vendor — the total would be wrong — and says so on paper, so a draft cannot
 * be paid by mistake.
 */

import { externalState, type ChargeRow } from "@/lib/charges";

export type InvoiceLine = {
  no: number;
  description: string;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
};

export type InvoiceSummary = {
  lines: InvoiceLine[];
  total: number;
  /** Lines with no selling price yet. */
  unpriced: number;
  /** External work sent out and not back. */
  atVendor: number;
  isDraft: boolean;
  /** Why it is a draft, in words for the counter. */
  reasons: string[];
};

export function buildInvoice(rows: readonly ChargeRow[]): InvoiceSummary {
  let total = 0;
  let unpriced = 0;
  let atVendor = 0;
  const lines = rows.map((r, i) => {
    if (externalState(r) === "at_vendor") atVendor += 1;
    if (r.unit_price === null) {
      unpriced += 1;
      return { no: i + 1, description: r.description, quantity: r.quantity, unitPrice: null, amount: null };
    }
    const amount = r.unit_price * r.quantity;
    total += amount;
    return { no: i + 1, description: r.description, quantity: r.quantity, unitPrice: r.unit_price, amount };
  });
  const reasons: string[] = [];
  if (rows.length === 0) reasons.push("Belum ada biaya yang dicatat.");
  if (unpriced > 0) reasons.push(`${unpriced} baris belum ada harga jual.`);
  if (atVendor > 0) reasons.push(`${atVendor} pekerjaan masih di vendor.`);
  return { lines, total, unpriced, atVendor, isDraft: reasons.length > 0, reasons };
}

const DATE = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** "20 Okt 2026", in Batam time. */
export function invoiceDate(date: Date): string {
  return DATE.format(date);
}

/** When the invoice is printed. The one clock read, kept out of the page. */
export function printedAt(): string {
  return DATE_TIME.format(new Date());
}

export type InvoiceFormat = "a4" | "struk";

/** A4 by default; "struk" for an 80 mm receipt printer at the cashier. */
export function invoiceFormat(raw: string | null | undefined): InvoiceFormat {
  return raw === "struk" ? "struk" : "a4";
}
