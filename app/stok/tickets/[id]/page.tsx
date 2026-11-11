import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ReadOnlyTicketView } from "@/components/tickets/ReadOnlyTicketView";

export const metadata = { title: "Detail Tiket — HNS IT Center" };

/** One ticket for Admin Stok, any store, read only. */
export default async function StockTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("StockAdmin", "Administrator");
  const { id: raw } = await params;
  const ticket = await db.ticket.findFirst({
    where: { OR: [{ id: raw }, { ticket_code: raw }] },
    select: { id: true, ticket_type: true },
  });
  if (!ticket) notFound();

  return (
    <ReadOnlyTicketView
      id={ticket.id}
      viewerId={session.userId}
      back={ticket.ticket_type === "pc_build" ? { href: "/stok/rakitan", label: "Rakitan PC" } : { href: "/stok/part", label: "Part Keluar" }}
    />
  );
}
