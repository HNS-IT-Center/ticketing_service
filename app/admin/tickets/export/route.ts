import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { TICKET_EXPORT_SELECT, ticketExportFilename, ticketExportSheet } from "@/lib/ticket-export";
import { ticketListOrderBy, ticketListWhere, ticketSearchWhere } from "@/lib/ticket-list-filter";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";

/**
 * GET /admin/tickets/export?status=…&q=…&sort=… — every ticket the All Tickets
 * list would show under the same filter, search and sort, across all pages, as
 * an .xlsx file.
 *
 * Administrator only. `proxy.ts` already keeps other roles out of /admin, but
 * the file carries customer phone numbers and e-mail addresses, so the handler
 * checks again rather than relying on the matcher.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "Administrator") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "all";

  const tickets = await db.ticket.findMany({
    where: { ...ticketListWhere(status), ...ticketSearchWhere(params.get("q") || "") },
    orderBy: ticketListOrderBy(params.get("sort") || ""),
    select: TICKET_EXPORT_SELECT,
  });

  const file = buildXlsx(ticketExportSheet(tickets));
  const q = (params.get("q") || "").trim();
  await logActivity(
    session,
    "export.tickets",
    `Mengekspor ${tickets.length} tiket ke Excel (filter: ${status}${q ? `, cari "${q}"` : ""}).`,
  );

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${ticketExportFilename(new Date(), status)}"`,
      "Cache-Control": "no-store",
    },
  });
}
