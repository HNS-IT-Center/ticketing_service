import { notFound } from "next/navigation";
import { requireStoreViewer, ticketInStores } from "@/lib/store-scope-server";
import { ReadOnlyTicketView } from "@/components/tickets/ReadOnlyTicketView";

export const metadata = { title: "Detail Tiket — HNS IT Center" };

/**
 * One ticket, for the kepala toko, read only. A ticket outside the viewer's
 * stores is a 404, not a refusal, so the page says nothing about tickets that
 * are not theirs.
 */
export default async function StoreTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, stores } = await requireStoreViewer("page_toko_tickets", "page_toko_dashboard", "page_toko_followups");
  const { id: raw } = await params;
  const id = await ticketInStores(raw, stores.map((s) => s.id));
  if (!id) notFound();

  return <ReadOnlyTicketView id={id} viewerId={session.userId} back={{ href: "/toko/tickets", label: "Tiket Toko" }} />;
}
