import type { NextRequest } from "next/server";
import { findQuoteCode } from "@/lib/ecommerce/quote-contract";
import { loadBuildStatuses, MAX_STATUS_CODES } from "@/lib/ecommerce/build-status";
import { integrationJson as json, refuseIntegrationCaller } from "@/lib/ecommerce/integration-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/ecommerce/pc-builds?codes=HNSPC-…,HNSPC-…
 *
 * For the e-commerce quotation lists: which of these quotations already have
 * a live PC build ticket, so they can be marked "Sudah dirakit". Up to
 * MAX_STATUS_CODES codes per call, comma separated, any case. Same token as
 * the photo route beside it.
 *
 *   200 { builds: { [code]: BuildStatus } } — a code with no live ticket is left out
 *   400 no codes, too many, or one that is not a quotation code
 *   401 missing or wrong token       503 this server has no token set
 */
export async function GET(request: NextRequest) {
  const refused = refuseIntegrationCaller(request);
  if (refused) return refused;

  const typed = (request.nextUrl.searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const codes = [...new Set(typed)];
  if (codes.length === 0) return json({ error: "Kirim kode quotation di parameter codes." }, 400);
  if (codes.length > MAX_STATUS_CODES) return json({ error: `Maksimal ${MAX_STATUS_CODES} kode per permintaan.` }, 400);
  const bad = codes.find((c) => findQuoteCode(c) !== c);
  if (bad) return json({ error: `Kode quotation tidak dikenali: ${bad.slice(0, 40)}` }, 400);

  try {
    return json({ builds: await loadBuildStatuses(codes) }, 200);
  } catch (err) {
    console.error("[integrations/pc-builds status]", err);
    return json({ error: "Ticketing sedang tidak bisa membaca data rakitan." }, 500);
  }
}
