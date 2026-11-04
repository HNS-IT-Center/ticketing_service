import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import PublicTicketPage from "@/app/[date]/[shareToken]/page";

export const metadata = { title: "Ticket Status — HNS IT Center" };

/**
 * The short public link, /t/[code] — what the WhatsApp buttons send.
 *
 * Resolves the code to the ticket's share token and renders the same page as
 * the long /[date]/[token] link, so there is one public page and one set of
 * rules about what a customer may see. The code is random like the token, so
 * it opens only the ticket it was issued for.
 */
export default async function ShortPublicTicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ticket = await db.ticket.findUnique({
    where: { public_short_code: code },
    select: { public_share_token: true, created_at: true },
  });
  if (!ticket?.public_share_token) notFound();

  return PublicTicketPage({
    params: Promise.resolve({
      date: ticket.created_at.toISOString().split("T")[0],
      shareToken: ticket.public_share_token,
    }),
  });
}
