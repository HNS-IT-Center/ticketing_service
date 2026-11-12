import { db } from "@/lib/db";
import { pageSession } from "@/lib/page-access";
import { storeScopeFor, storeWhere } from "@/lib/store-scope-server";
import { CLAIM_EXPORT_SELECT, claimExportFilename, claimExportSheet } from "@/lib/rma/claim-export";
import { CLAIM_OWNER_LABELS, claimListOrderBy, claimListWhere, readClaimOwner } from "@/lib/rma/claim-list";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { logActivity } from "@/lib/activity";

/**
 * GET /rma/tickets/export?status=…&owner=…&q=…&sort=… — every claim the Klaim Garansi
 * list would show under the same filter, search and sort, across all pages, as
 * an .xlsx file.
 *
 * RMA desk and administrators only — the `/rma` rule in `proxy.ts`, checked
 * again here because the file carries the vendor's claim numbers, the desk's
 * notes and customer phone numbers.
 */
export async function GET(request: Request) {
  const session = await pageSession("page_rma_claims");
  if (!session) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "all";
  const owner = readClaimOwner(params.get("owner"));

  const claims = await db.ticket.findMany({
    // The file holds what the list shows: a kepala toko's stores, or every store.
    where: { AND: [claimListWhere(status, params.get("q") || "", owner), storeWhere(await storeScopeFor(session))] },
    orderBy: claimListOrderBy(params.get("sort") || ""),
    select: CLAIM_EXPORT_SELECT,
  });

  const now = new Date();
  const file = buildXlsx(claimExportSheet(claims, now));
  const q = (params.get("q") || "").trim();
  await logActivity(
    session,
    "export.claims",
    `Mengekspor ${claims.length} klaim garansi ke Excel (filter: ${status}${owner !== "all" ? `, ${CLAIM_OWNER_LABELS[owner]}` : ""}${q ? `, cari "${q}"` : ""}).`,
  );

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${claimExportFilename(now, owner === "all" ? status : status === "all" ? owner : `${status}-${owner}`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
