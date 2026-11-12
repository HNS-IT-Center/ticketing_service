import type { ServicePart } from "@prisma/client";
import { pageSession } from "@/lib/page-access";
import { logActivity } from "@/lib/activity";
import { toCsv } from "@/lib/csv";
import { servicePartLabel } from "@/lib/service-parts";
import { PART_REPORT_CSV_HEADER } from "@/lib/reports/parts";
import { loadPartRows, resolveReportMonth } from "@/lib/reports/parts-data";

/** WIB timestamp for the sheet: "2026-10-19 14:05". */
function wib(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** GET /admin/reports/parts/export?month=YYYY-MM&store=… — every row, as CSV. */
export async function GET(request: Request) {
  const session = await pageSession("page_parts_report");
  if (!session) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const month = resolveReportMonth(params.get("month"));
  const rows = (await loadPartRows(month, params.get("store") || null)) ?? [];

  const csv = toCsv([
    [...PART_REPORT_CSV_HEADER],
    ...rows.map((r) => [
      wib(r.createdAt),
      r.ticketCode,
      r.storeName ?? "",
      r.technicianName,
      servicePartLabel(r.part as ServicePart),
      r.itemName ?? "",
      r.sku ?? "",
      r.catalogCategory ?? "",
      String(r.quantity),
      r.notes ?? "",
    ]),
  ]);

  await logActivity(session, "export.parts", `Mengekspor laporan part ${month} (${rows.length} baris).`);

  // BOM so Excel opens the UTF-8 correctly.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-part-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
