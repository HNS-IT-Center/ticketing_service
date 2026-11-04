import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { CLAIM_EXPORT_SELECT, claimExportFilename, claimExportSheet } from "@/lib/rma/claim-export";
import { claimListOrderBy, claimListWhere } from "@/lib/rma/claim-list";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { logActivity } from "@/lib/activity";

/**
 * GET /rma/tickets/export?status=…&q=…&sort=… — every claim the Klaim Garansi
 * list would show under the same filter, search and sort, across all pages, as
 * an .xlsx file.
 *
 * RMA desk and administrators only — the `/rma` rule in `proxy.ts`, checked
 * again here because the file carries the vendor's claim numbers, the desk's
 * notes and customer phone numbers.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "RMA" && session.role !== "Administrator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "all";

  const claims = await db.ticket.findMany({
    where: claimListWhere(status, params.get("q") || ""),
    orderBy: claimListOrderBy(params.get("sort") || ""),
    select: CLAIM_EXPORT_SELECT,
  });

  const now = new Date();
  const file = buildXlsx(claimExportSheet(claims, now));
  const q = (params.get("q") || "").trim();
  await logActivity(
    session,
    "export.claims",
    `Mengekspor ${claims.length} klaim garansi ke Excel (filter: ${status}${q ? `, cari "${q}"` : ""}).`,
  );

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${claimExportFilename(now, status)}"`,
      "Cache-Control": "no-store",
    },
  });
}
