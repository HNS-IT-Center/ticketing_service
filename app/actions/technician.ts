"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

function getTicketPoints(type: string): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

// ─── Take Ticket (Technician) ──────────────────────────────────────────────
export async function takeTicketAction(ticketId: string) {
  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { error: "Ticket not found" };
  if (ticket.technician_id) return { error: "Ticket already assigned" };
  if (ticket.status !== "waiting") return { error: "Ticket is not in waiting status" };

  // Workload check
  const points = getTicketPoints(ticket.ticket_type);
  const workload = await db.technicianWorkload.findUnique({
    where: { technician_id: session.userId },
  });

  const currentPoints = workload?.current_points ?? 0;
  const maxPoints = workload?.max_points ?? 7;

  if (currentPoints + points > maxPoints) {
    return {
      error: `Cannot take ticket — workload limit reached (${currentPoints}/${maxPoints} pts)`,
    };
  }

  // Assign technician
  await db.ticket.update({
    where: { id: ticketId },
    data: { technician_id: session.userId },
  });

  // Update workload
  await db.technicianWorkload.upsert({
    where: { technician_id: session.userId },
    create: { technician_id: session.userId, current_points: points, max_points: 7 },
    update: { current_points: { increment: points } },
  });

  // Log status (stays waiting but assigned)
  await db.ticketStatusLog.create({
    data: {
      ticket_id: ticketId,
      old_status: "waiting",
      new_status: "waiting",
      changed_by: session.userId,
    },
  });

  // Notify customer
  await db.notification.create({
    data: {
      user_id: ticket.user_id,
      ticket_id: ticketId,
      type: "status_update",
    },
  });

  // Notify the technician that they have been assigned
  await db.notification.create({
    data: {
      user_id: session.userId,
      ticket_id: ticketId,
      type: "assigned",
      message: `You have been assigned ticket #${ticket.ticket_code}`,
    },
  });

  revalidatePath("/technician/dashboard");
  revalidatePath(`/technician/tickets/${ticketId}`);
  return { success: true };
}

// ─── Update Ticket Status ──────────────────────────────────────────────────
export async function updateTicketStatusAction(
  ticketId: string,
  newStatus: "on_progress" | "done" | "cancelled" | "rejected"
) {
  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { error: "Ticket not found" };

  // Only assigned technician can change status
  if (ticket.technician_id !== session.userId) {
    return { error: "You are not assigned to this ticket" };
  }

  // Validation rules
  if (newStatus === "on_progress" && ticket.status !== "waiting") {
    return { error: "Can only move to On Progress from Waiting" };
  }
  if (newStatus === "done" && ticket.status !== "on_progress") {
    return { error: "Can only mark Done from On Progress" };
  }

  const oldStatus = ticket.status;

  await db.ticket.update({
    where: { id: ticketId },
    data: { status: newStatus },
  });

  // Log
  const log = await db.ticketStatusLog.create({
    data: {
      ticket_id: ticketId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: session.userId,
    },
  });

  // Update workload + performance when terminal
  const isTerminal = ["done", "cancelled", "rejected"].includes(newStatus);
  if (isTerminal) {
    const points = getTicketPoints(ticket.ticket_type);

    // Reduce workload
    await db.technicianWorkload.updateMany({
      where: { technician_id: session.userId },
      data: { current_points: { decrement: points } },
    });

    // Update performance
    const isSuccess = newStatus === "done";
    await db.technicianPerformance.upsert({
      where: { technician_id: session.userId },
      create: {
        technician_id: session.userId,
        tickets_handled: 1,
        success_count: isSuccess ? 1 : 0,
        failed_count: isSuccess ? 0 : 1,
        total_points_completed: isSuccess ? points : 0,
      },
      update: {
        tickets_handled: { increment: 1 },
        success_count: { increment: isSuccess ? 1 : 0 },
        failed_count: { increment: isSuccess ? 0 : 1 },
        total_points_completed: { increment: isSuccess ? points : 0 },
      },
    });
  }

  // Notify customer of status change
  await db.notification.create({
    data: {
      user_id: ticket.user_id,
      ticket_id: ticketId,
      type: "status_update",
      reference_id: log.id,
    },
  });

  // When done: notify the technician with points earned
  if (newStatus === "done") {
    const points = getTicketPoints(ticket.ticket_type);
    // Fetch updated total to show current total
    const perf = await db.technicianPerformance.findUnique({
      where: { technician_id: session.userId },
      select: { total_points_completed: true },
    });
    const currentTotal = perf?.total_points_completed ?? points;
    await db.notification.create({
      data: {
        user_id: session.userId,
        ticket_id: ticketId,
        type: "completed",
        message: `🎉 Congratulations! You earned ${points} pts for ticket #${ticket.ticket_code}. Current total: ${currentTotal} pts`,
      },
    });
  }

  revalidatePath(`/technician/tickets/${ticketId}`);
  revalidatePath(`/customer/tickets/${ticketId}`);
  return { success: true };
}

// ─── Update Ticket Notes ───────────────────────────────────────────────────
export async function updateTicketNotesAction(ticketId: string, notes: string) {
  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (ticket?.technician_id !== session.userId) {
    return { error: "Not authorized" };
  }

  await db.ticket.update({ where: { id: ticketId }, data: { notes } });
  revalidatePath(`/technician/tickets/${ticketId}`);
  return { success: true };
}
