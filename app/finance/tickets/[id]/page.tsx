import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { STORE_STOCK_CLAIM_WHERE } from "@/lib/finance-claims-server";
import { ReadOnlyTicketView } from "@/components/tickets/ReadOnlyTicketView";

export const metadata = { title: "Detail Klaim — HNS IT Center" };

/**
 * One store-stock claim for Finance, read only. Any other ticket is a 404:
 * Finance sees the shop's own claimed stock, not customers' tickets.
 */
export default async function FinanceTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("Finance", "Administrator");
  const { id: raw } = await params;
  const ticket = await db.ticket.findFirst({
    where: { AND: [STORE_STOCK_CLAIM_WHERE, { OR: [{ id: raw }, { ticket_code: raw }] }] },
    select: { id: true },
  });
  if (!ticket) notFound();
  return <ReadOnlyTicketView id={ticket.id} viewerId={session.userId} back={{ href: "/finance/klaim", label: "Klaim Stok Toko" }} />;
}
