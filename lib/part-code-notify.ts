import "server-only";
import { db } from "@/lib/db";
import { AWAITING_CODE_PART_WHERE, partCodeReminderMessage } from "@/lib/part-code-alerts";

/**
 * Bell entry for the technician holding a service ticket that has just reached
 * `done` while some of its parts still have no Accurate code. Called by both
 * status actions after the transition is saved.
 *
 * Never throws: the status change has already been written, and a reminder
 * that failed must not make it look as if the change did.
 */
export async function notifyPartCodePending(ticketId: string): Promise<void> {
  try {
    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticket_code: true,
        ticket_type: true,
        technician_id: true,
        _count: { select: { replaced_parts: { where: AWAITING_CODE_PART_WHERE } } },
      },
    });
    if (!ticket || ticket.ticket_type !== "service" || !ticket.technician_id) return;
    const count = ticket._count.replaced_parts;
    if (count === 0) return;

    await db.notification.create({
      data: {
        user_id: ticket.technician_id,
        ticket_id: ticketId,
        type: "status_update",
        message: partCodeReminderMessage(ticket.ticket_code, count),
      },
    });
  } catch (err) {
    console.error("[PART CODE REMINDER]", err);
  }
}
