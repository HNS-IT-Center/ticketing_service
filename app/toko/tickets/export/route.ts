import { db } from "@/lib/db";
import { pageSession } from "@/lib/page-access";
import { logActivity } from "@/lib/activity";
import { storesFor } from "@/lib/store-dashboard-server";
import { pickStores } from "@/lib/store-scope-server";
import { STORE_TICKET_TYPES, storeTicketWhere } from "@/lib/store-ticket-list";
import { TICKET_EXPORT_SELECT, ticketExportFilename, ticketExportSheet } from "@/lib/ticket-export";
import { ticketListOrderBy } from "@/lib/ticket-list-filter";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";

/**
 * GET /toko/tickets/export — what Tiket Toko lists under the same filters, all
 * pages, as .xlsx. Kepala toko (their own stores) and administrators. The file
 * carries customer phone numbers, so the handler checks the session itself
 * rather than relying on the proxy.
 */
export async function GET(request: Request) {
  const session = await pageSession("page_toko_tickets");
  if (!session) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const stores = await storesFor(session);
  const params = new URL(request.url).searchParams;
  const { ids, shown } = pickStores(stores, params.get("store") ?? undefined);
  const status = params.get("status") || "all";
  const type = params.get("type") ?? undefined;
  const tickets = ids.length
    ? await db.ticket.findMany({
        where: storeTicketWhere({
          storeIds: ids,
          status,
          query: params.get("q") || "",
          technicianId: params.get("tech") || undefined,
          type: (STORE_TICKET_TYPES as string[]).includes(type ?? "") ? type : undefined,
        }),
        orderBy: ticketListOrderBy(params.get("sort") || ""),
        select: TICKET_EXPORT_SELECT,
      })
    : [];

  const file = buildXlsx(ticketExportSheet(tickets));
  await logActivity(
    session,
    "export.tickets",
    `Mengekspor ${tickets.length} tiket toko ${shown.map((s) => s.name).join(", ") || "-"} ke Excel (filter: ${status}).`,
  );
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${ticketExportFilename(new Date(), status)}"`,
      "Cache-Control": "no-store",
    },
  });
}
