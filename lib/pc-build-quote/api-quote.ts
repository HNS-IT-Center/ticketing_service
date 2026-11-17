import "server-only";
import { fetchEcommerceQuote } from "@/lib/ecommerce/quotes";
import { quoteSourceLines, type EcommerceQuote, type QuoteRef } from "@/lib/ecommerce/quote-contract";
import { normalizePhone } from "@/lib/ticket-edit";
import { findQuoteSales, matchQuoteToCatalog, ticketUsingQuote } from "./resolve";
import type { UploadedQuote } from "./parse";

const PRICED_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export type ApiQuoteResult =
  | { ok: true; quote: UploadedQuote; raw: EcommerceQuote }
  | { ok: false; error: string; status: number };

/**
 * A quotation from the e-commerce API, ready for the intake checklist —
 * refused when it is already a live ticket. Shared by `/api/pc-build-quote` and
 * `createTicketAction`, which asks again rather than trusting the browser.
 */
export async function readApiQuote(ref: QuoteRef): Promise<ApiQuoteResult> {
  const fetched = await fetchEcommerceQuote(ref);
  if (!fetched.ok) return { ok: false, error: fetched.error, status: 502 };
  const raw = fetched.quote;

  const used = await ticketUsingQuote(raw.code);
  if (used) {
    return {
      ok: false,
      error: `Quotation ${raw.code} sudah dibuat tiketnya: ${used.ticket_code}. Buka tiket itu, jangan membuat tiket baru.`,
      status: 409,
    };
  }

  const [{ items, catalogChecked }, sales] = await Promise.all([
    matchQuoteToCatalog(quoteSourceLines(raw)),
    findQuoteSales(raw.salesName, raw.sales?.ssoSub ?? null),
  ]);
  const priced = new Date(raw.pricedAt);
  return {
    ok: true,
    raw,
    quote: {
      source: "api",
      code: raw.code,
      customer: raw.customer.name,
      customerPhone: normalizePhone(raw.customer.phone),
      salesName: raw.salesName,
      date: Number.isNaN(priced.getTime()) ? null : PRICED_DATE.format(priced),
      total: raw.total,
      url: "",
      publicUrl: raw.publicUrl,
      revision: raw.revision,
      status: raw.status,
      items,
      catalogChecked,
      sales,
    },
  };
}
