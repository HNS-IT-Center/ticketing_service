import "server-only";
import { db } from "@/lib/db";

/**
 * Who hears about a ticket the moment it is created (owner, 2026-11-05):
 *
 * - assigned at intake → the technician it was given to, unless they opened it
 *   themselves;
 * - nobody assigned → the store's coordinators (technicians with
 *   `is_team_leader` assigned to the ticket's store), so someone takes
 *   responsibility for it. A store with no coordinator falls back to the
 *   administrators, so the ticket is never announced to no one.
 *
 * Whoever created the ticket is never notified about it. Never throws: the
 * ticket is already saved, and a failed notification must not report the
 * creation as failed.
 */
export async function notifyNewTicket(input: {
  ticketId: string;
  ticketCode: string;
  typeLabel: string;
  storeId: string | null;
  technicianId: string | null;
  creatorId: string;
}): Promise<number> {
  try {
    if (input.technicianId) {
      if (input.technicianId === input.creatorId) return 0;
      await db.notification.create({
        data: {
          user_id: input.technicianId,
          ticket_id: input.ticketId,
          type: "assigned",
          message: `Tiket baru #${input.ticketCode} (${input.typeLabel}) ditugaskan ke Anda.`,
        },
      });
      return 1;
    }

    const coordinators = input.storeId
      ? await db.user.findMany({
          where: {
            role: "Technician",
            is_team_leader: true,
            is_active: true,
            store_assignments: { some: { store_id: input.storeId } },
          },
          select: { id: true },
        })
      : [];
    const recipients = coordinators.length
      ? coordinators
      : await db.user.findMany({ where: { role: "Administrator", is_active: true }, select: { id: true } });
    const to = recipients.map((u) => u.id).filter((id) => id !== input.creatorId);
    if (to.length === 0) return 0;

    await db.notification.createMany({
      data: to.map((user_id) => ({
        user_id,
        ticket_id: input.ticketId,
        type: "needs_assignment" as const,
        message: `Tiket baru #${input.ticketCode} (${input.typeLabel}) belum ada teknisi penanggung jawabnya.`,
      })),
    });
    return to.length;
  } catch (err) {
    console.error("[NEW TICKET NOTIFY]", err);
    return 0;
  }
}
