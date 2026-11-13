"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { EARNING_TRANSITION_FILTER } from "@/lib/kpi";
import { JOB_POINT_CHARGES, ticketTotalPoints } from "@/lib/points";
import { logActivity } from "@/lib/activity";

type Result = { success: true } | { error: string };

const floor = (n: number) => (n < 0 ? 0 : n);

function refresh(ticketId: string, technicianId: string | null) {
  revalidateTag("leaderboard-techs", "max");
  revalidateTag("leaderboard-stores", "max");
  revalidateTag("tech-month-winner", "max");
  if (technicianId) revalidateTag(`user-profile:${technicianId}`, "max");
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin/reports/audit");
}

/**
 * Take a ticket's points off (owner, 2026-11-13): a ticket that looks made up
 * keeps its history but earns nothing. Administrator only, reason required.
 *
 * The leaderboard and every report read the log through
 * EARNING_STATUS_LOG_FILTER, which leaves such a ticket out at once. The stored
 * TechnicianPerformance is reduced here by what the ticket credited — counted
 * from the log, the way deleting a ticket counts it — and the amounts are kept
 * on the ticket so restoring gives back exactly that.
 */
export async function excludeTicketPointsAction(ticketId: string, reason: string): Promise<Result> {
  const session = await requireRole("Administrator");
  const why = reason.trim();
  if (!why) return { error: "Tulis alasan kenapa poin tiket ini dihapus." };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticket_code: true,
      ticket_type: true,
      device_type: true,
      technician_id: true,
      points_excluded_at: true,
      cleaning_detail: { select: { service_package: true } },
      charges: JOB_POINT_CHARGES,
    },
  });
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.points_excluded_at) return { error: "Poin tiket ini sudah dihapus." };

  const earningLogs = await db.ticketStatusLog.count({ where: { ticket_id: ticketId, ...EARNING_TRANSITION_FILTER } });
  const points = earningLogs * ticketTotalPoints({ ...ticket, points_excluded_at: null });

  const done = await db.$transaction(async (tx) => {
    // Conditional, so two administrators at once take the points off once.
    const marked = await tx.ticket.updateMany({
      where: { id: ticketId, points_excluded_at: null },
      data: {
        points_excluded_at: new Date(),
        points_excluded_by: session.name,
        points_excluded_reason: why,
        points_excluded_points: points,
        points_excluded_logs: earningLogs,
      },
    });
    if (marked.count === 0) return false;
    if (ticket.technician_id && earningLogs > 0) {
      const perf = await tx.technicianPerformance.findUnique({ where: { technician_id: ticket.technician_id } });
      if (perf) {
        await tx.technicianPerformance.update({
          where: { technician_id: ticket.technician_id },
          data: {
            tickets_handled: floor(perf.tickets_handled - earningLogs),
            success_count: floor(perf.success_count - earningLogs),
            total_points_completed: floor(perf.total_points_completed - points),
          },
        });
      }
    }
    return true;
  });
  if (!done) return { error: "Poin tiket ini sudah dihapus." };

  await logActivity(session, "ticket.points_excluded", `Menghapus ${points} poin ${ticket.ticket_code}: ${why}`, {
    type: "ticket",
    id: ticket.id,
    label: ticket.ticket_code,
  });
  refresh(ticket.id, ticket.technician_id);
  return { success: true };
}

/** Give back exactly what excludeTicketPointsAction took. Administrator only. */
export async function restoreTicketPointsAction(ticketId: string): Promise<Result> {
  const session = await requireRole("Administrator");
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticket_code: true,
      technician_id: true,
      points_excluded_at: true,
      points_excluded_points: true,
      points_excluded_logs: true,
    },
  });
  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (!ticket.points_excluded_at) return { error: "Poin tiket ini tidak sedang dihapus." };
  const points = ticket.points_excluded_points ?? 0;
  const logs = ticket.points_excluded_logs ?? 0;

  const done = await db.$transaction(async (tx) => {
    const cleared = await tx.ticket.updateMany({
      where: { id: ticketId, points_excluded_at: { not: null } },
      data: {
        points_excluded_at: null,
        points_excluded_by: null,
        points_excluded_reason: null,
        points_excluded_points: null,
        points_excluded_logs: null,
      },
    });
    if (cleared.count === 0) return false;
    if (ticket.technician_id && logs > 0) {
      await tx.technicianPerformance.upsert({
        where: { technician_id: ticket.technician_id },
        create: { technician_id: ticket.technician_id, tickets_handled: logs, success_count: logs, total_points_completed: points },
        update: {
          tickets_handled: { increment: logs },
          success_count: { increment: logs },
          total_points_completed: { increment: points },
        },
      });
    }
    return true;
  });
  if (!done) return { error: "Poin tiket ini tidak sedang dihapus." };

  await logActivity(session, "ticket.points_restored", `Mengembalikan ${points} poin ${ticket.ticket_code}`, {
    type: "ticket",
    id: ticket.id,
    label: ticket.ticket_code,
  });
  refresh(ticket.id, ticket.technician_id);
  return { success: true };
}
