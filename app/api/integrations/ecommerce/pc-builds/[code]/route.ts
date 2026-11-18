import type { NextRequest } from "next/server";
import { findQuoteCode } from "@/lib/ecommerce/quote-contract";
import { loadBuildPhotos } from "@/lib/ecommerce/build-photos";
import { integrationJson as json, refuseIntegrationCaller } from "@/lib/ecommerce/integration-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/ecommerce/pc-builds/{quotation code}
 *
 * For the e-commerce cashier page: the photos of the build opened from that
 * quotation, which the cashier attaches to the sale in Accurate. Called
 * server to server with `Authorization: Bearer <TICKETING_INTEGRATION_TOKEN>`
 * — the secret both systems already share for the quotation lookup the other
 * way. `proxy.ts` lets every /api path through, so this check is the only one.
 *
 *   200 the build and its photos     400 not a quotation code
 *   401 missing or wrong token       404 no live ticket from that quotation
 *   503 this server has no token set
 */

export async function GET(request: NextRequest, ctx: RouteContext<"/api/integrations/ecommerce/pc-builds/[code]">) {
  const refused = refuseIntegrationCaller(request);
  if (refused) return refused;

  const { code: raw } = await ctx.params;
  const typed = decodeURIComponent(raw).trim().toUpperCase();
  const code = findQuoteCode(typed);
  if (!code || code !== typed) return json({ error: "Kode quotation tidak dikenali." }, 400);

  try {
    const body = await loadBuildPhotos(code);
    if (!body) return json({ error: `Belum ada tiket rakitan dari quotation ${code}.` }, 404);
    return json(body, 200);
  } catch (err) {
    console.error("[integrations/pc-builds]", err);
    return json({ error: "Ticketing sedang tidak bisa membaca data rakitan." }, 500);
  }
}
