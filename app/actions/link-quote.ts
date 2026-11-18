"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { logActivity } from "@/lib/activity";
import { parseQuoteRef } from "@/lib/ecommerce/quote-contract";
import { fetchEcommerceQuote } from "@/lib/ecommerce/quotes";
import { ticketUsingQuote } from "@/lib/pc-build-quote/resolve";

export type LinkQuoteResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * Record which quotation an existing PC build was sold on (owner, 2026-11-18):
 * builds opened before the quotation lookup, or without it, carry no code, so
 * the e-commerce "Dokumentasi Rakitan" page cannot find their photos.
 *
 * Only the code (and the quotation's web page) is written. Nothing is checked
 * against the components on the ticket and `quote_source` stays empty: this
 * build was not ticked against the quotation at intake, and the record must
 * not say it was. The code is confirmed with the e-commerce side first, so a
 * typo cannot link a build to someone else's quotation, and one quotation
 * still opens one live ticket. Guarded by `edit_ticket`, like every other
 * correction to a ticket's intake data.
 */
export async function linkQuoteToTicketAction(ticketId: string, input: string): Promise<LinkQuoteResult> {
  const session = await requireSession();
  const access = await accessFor(session.userId);
  if (!access.can("edit_ticket")) return { ok: false, error: "Anda tidak punya akses untuk mengubah data tiket." };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, ticket_code: true, ticket_type: true, pc_build_detail: { select: { quote_code: true } } },
  });
  if (!ticket) return { ok: false, error: "Tiket tidak ditemukan." };
  if (ticket.ticket_type !== "pc_build") return { ok: false, error: "Hanya tiket Rakit PC yang bisa ditautkan ke quotation." };
  if (ticket.pc_build_detail?.quote_code) {
    return { ok: false, error: `Tiket ini sudah tertaut ke quotation ${ticket.pc_build_detail.quote_code}.` };
  }

  const ref = parseQuoteRef(input);
  if (!ref) return { ok: false, error: "Tulis kode quotation (contoh: HNSPC-20261115-0165) atau tempel tautannya." };

  const read = await fetchEcommerceQuote(ref, null);
  if (!read.ok) return { ok: false, error: read.error };
  const code = read.quote.code;

  const used = await ticketUsingQuote(code);
  if (used && used.id !== ticket.id) {
    return { ok: false, error: `Quotation ${code} sudah tertaut ke tiket ${used.ticket_code}.` };
  }

  // Conditional, so two people linking at once record one quotation.
  const data = { quote_code: code, quote_public_url: read.quote.publicUrl };
  if (ticket.pc_build_detail) {
    const { count } = await db.ticketPcBuildDetail.updateMany({ where: { ticket_id: ticket.id, quote_code: null }, data });
    if (count === 0) return { ok: false, error: "Tiket ini baru saja ditautkan orang lain. Muat ulang halamannya." };
  } else {
    await db.ticketPcBuildDetail.create({ data: { ticket_id: ticket.id, ...data } });
  }

  await logActivity(session, "ticket.edit", `Menautkan tiket ${ticket.ticket_code} ke quotation ${code}`, {
    type: "ticket",
    id: ticket.id,
    label: ticket.ticket_code,
  });
  revalidatePath(`/admin/tickets/${ticket.id}`);
  revalidatePath(`/technician/tickets/${ticket.id}`);
  revalidatePath(`/sales/tickets/${ticket.id}`);
  return { ok: true, code };
}
