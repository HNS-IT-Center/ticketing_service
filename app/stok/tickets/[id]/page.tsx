import { requirePage } from "@/lib/page-access";
import { inScope, storeScopeFor } from "@/lib/store-scope-server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ReadOnlyTicketView } from "@/components/tickets/ReadOnlyTicketView";

export const metadata = { title: "Detail Tiket — HNS IT Center" };

/** One ticket from the stock pages, read only — any store, or a kepala toko's own. */
export default async function StockTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("page_stock_builds", "page_stock_parts", "page_stock_dashboard");
  const { id: raw } = await params;
  const ticket = await db.ticket.findFirst({
    where: { OR: [{ id: raw }, { ticket_code: raw }] },
    select: { id: true, ticket_type: true, store_location_id: true },
  });
  // Another store's ticket is not there for a kepala toko.
  if (!ticket || !inScope(await storeScopeFor(session), ticket.store_location_id)) notFound();

  return (
    <ReadOnlyTicketView
      id={ticket.id}
      viewerId={session.userId}
      back={ticket.ticket_type === "pc_build" ? { href: "/stok/rakitan", label: "Rakitan PC" } : { href: "/stok/part", label: "Part Keluar" }}
    />
  );
}
