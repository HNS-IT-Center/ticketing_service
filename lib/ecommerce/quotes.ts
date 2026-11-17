import "server-only";
import { quoteRefPath, readEcommerceQuote, type EcommerceQuote, type QuoteRef } from "./quote-contract";

/**
 * Reading a PC-build quotation from the e-commerce site (hnsitcenter.id).
 *
 * Server only. The token opens every quotation's customer name and phone, so
 * it never reaches a browser: the intake form asks /api/pc-build-quote, which
 * calls this. Off while HNS_ECOMMERCE_URL or TICKETING_INTEGRATION_TOKEN is
 * unset — the form then offers only the PDF upload it always had.
 *
 * Read only, like every call this app makes to another system.
 */

const TIMEOUT_MS = 8_000;

function settings(): { base: string; token: string } | null {
  const base = process.env.HNS_ECOMMERCE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.TICKETING_INTEGRATION_TOKEN?.trim();
  return base && token ? { base, token } : null;
}

export function isEcommerceConfigured(): boolean {
  return settings() !== null;
}

export type FetchQuoteResult = { ok: true; quote: EcommerceQuote } | { ok: false; error: string };

const FALLBACK = "Unggah PDF quotation-nya sebagai gantinya.";

/** The quotation, or a sentence for the person at the counter. Never throws. */
export async function fetchEcommerceQuote(ref: QuoteRef): Promise<FetchQuoteResult> {
  const s = settings();
  if (!s) return { ok: false, error: `Pencarian quotation dari ecommerce belum diaktifkan. ${FALLBACK}` };
  const named = ref.by === "code" ? `Quotation ${ref.code}` : "Quotation dari tautan itu";

  let res: Response;
  try {
    res = await fetch(s.base + quoteRefPath(ref), {
      // Both, as the e-commerce side asked: a proxy in front of it may drop
      // Authorization, and it reads X-Ticketing-Token only when that is gone.
      headers: { Authorization: `Bearer ${s.token}`, "X-Ticketing-Token": s.token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[ECOMMERCE QUOTE] request failed", err instanceof Error ? err.message : err);
    return { ok: false, error: `Web ecommerce tidak bisa dihubungi. Coba lagi sebentar, atau ${FALLBACK.toLowerCase()}` };
  }

  if (res.status === 404) return { ok: false, error: `${named} tidak ditemukan di ecommerce. Periksa kodenya.` };
  if (res.status === 400) return { ok: false, error: "Kode quotation tidak valid. Contoh: HNSPC-20261104-0027." };
  if (res.status === 401 || res.status === 503) {
    console.error(`[ECOMMERCE QUOTE] ${res.status}: token missing or wrong on one side`);
    return { ok: false, error: `Ticketing belum tersambung ke ecommerce. Kabari admin, lalu ${FALLBACK.toLowerCase()}` };
  }
  if (!res.ok) {
    console.error(`[ECOMMERCE QUOTE] unexpected status ${res.status}`);
    return { ok: false, error: `Web ecommerce sedang bermasalah. ${FALLBACK}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const quote = readEcommerceQuote(body);
  if (!quote) {
    console.error("[ECOMMERCE QUOTE] body does not match the contract");
    return { ok: false, error: `Jawaban ecommerce tidak dikenali. ${FALLBACK}` };
  }
  return { ok: true, quote };
}
