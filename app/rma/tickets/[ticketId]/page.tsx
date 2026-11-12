import { requirePage } from "@/lib/page-access";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Resolver for notification links.
 *
 * A Notification only carries ticket_id, and adding an rma_case_id column just
 * for this would duplicate a relation that already exists. This route looks the
 * case up by ticket and forwards to it; a ticket with no case is a plain 404.
 */
export default async function RmaTicketRedirectPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  await requirePage("page_rma_dashboard", "page_rma_claims");
  const { ticketId } = await params;

  const rmaCase = await db.rmaCase.findUnique({
    where: { ticket_id: ticketId },
    select: { id: true },
  });

  if (!rmaCase) notFound();

  redirect(`/rma/cases/${rmaCase.id}`);
}
