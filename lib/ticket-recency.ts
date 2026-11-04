/**
 * The "Baru" / "Update" mark on the All Tickets list: a ticket created, or
 * whose status moved, within the last day. Pure — the page passes its clock —
 * so the same ticket reads the same on every render of one request.
 */

export const RECENT_WINDOW_MS = 24 * 3600_000;

export type TicketRecency = { kind: "new" | "updated"; at: Date };

export function ticketRecency(
  ticket: { created_at: Date; updated_at: Date; last_status_at?: Date | null },
  now: Date,
): TicketRecency | null {
  const since = now.getTime() - RECENT_WINDOW_MS;
  // A status log written in the same moment the ticket was created is its
  // first `waiting`, not an update.
  const statusAt = ticket.last_status_at ?? null;
  const updatedAt =
    statusAt && statusAt.getTime() - ticket.created_at.getTime() > 60_000
      ? statusAt
      : ticket.updated_at.getTime() - ticket.created_at.getTime() > 60_000
        ? ticket.updated_at
        : null;

  if (updatedAt && updatedAt.getTime() >= since) return { kind: "updated", at: updatedAt };
  if (ticket.created_at.getTime() >= since) return { kind: "new", at: ticket.created_at };
  return null;
}

/** "baru saja", "12 menit lalu", "3 jam lalu". */
export function relativeTimeId(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
