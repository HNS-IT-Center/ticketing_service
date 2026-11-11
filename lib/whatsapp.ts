/**
 * WhatsApp messages the shop sends a customer. Pure; one copy of each wording,
 * so the ticket page's buttons and the kepala toko's follow-up list say the
 * same thing.
 */

/** "Siap diambil" — the unit is finished and waiting at the shop. */
export function readyForPickupText(customerName: string, ticketCode: string, detailUrl: string | null): string {
  return `Halo kak ${customerName}, perangkat kakak dengan nomor tiket ${ticketCode} sudah selesai dikerjakan dan siap diambil di toko. Terima kasih!\n\nCek detail: ${detailUrl ?? ""}`;
}

/** A wa.me link for a stored "+62…" number, or null without a usable number. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
