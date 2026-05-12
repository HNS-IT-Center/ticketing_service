"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { sendTicketStatusEmail } from "@/lib/email";

function getTicketPoints(type: string): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

// ─── Take Ticket (Technician) ──────────────────────────────────────────────
export async function takeTicketAction(ticketId: string) {
  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, user_id: true, technician_id: true, status: true, ticket_type: true, ticket_code: true },
  });
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

  // Notify customer — only if the customer is NOT the same person as the technician
  if (ticket.user_id !== session.userId) {
    await db.notification.create({
      data: {
        user_id: ticket.user_id,
        ticket_id: ticketId,
        type: "status_update",
      },
    });
  }

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
export async function updateTicketStatusAction(formData: FormData) {
  const ticketId = formData.get("ticketId") as string;
  const newStatus = formData.get("newStatus") as "on_progress" | "done" | "cancelled" | "rejected";
  const reason = formData.get("reason") as string | null;
  const files = formData.getAll("files") as File[];

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

  // Track performance timestamps
  const ticketUpdateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "on_progress") ticketUpdateData.work_started_at = new Date();
  if (newStatus === "done") ticketUpdateData.work_completed_at = new Date();

  await db.ticket.update({
    where: { id: ticketId },
    data: ticketUpdateData as any,
  });

  // Log
  const log = await db.ticketStatusLog.create({
    data: {
      ticket_id: ticketId,
      old_status: oldStatus,
      new_status: newStatus,
      reason: reason || null,
      changed_by: session.userId,
    },
  });

  // Handle Attachments
  if (files && files.length > 0) {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();
    const uploadOps = files.map(async (file) => {
      const ext = file.name.split(".").pop();
      const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type });

      if (error) return;

      const {
        data: { publicUrl },
      } = supabase.storage.from("attachments").getPublicUrl(data.path);

      let fileType: "image" | "video" | "pdf" = "pdf";
      if (file.type.startsWith("image/")) fileType = "image";
      if (file.type.startsWith("video/")) fileType = "video";

      await db.ticketAttachment.create({
        data: { ticket_id: ticketId, file_url: publicUrl, file_type: fileType },
      });
    });
    await Promise.all(uploadOps);
  }

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

  // Notify customer of status change (skip if technician is the ticket owner)
  if (ticket.user_id !== session.userId) {
    await db.notification.create({
      data: {
        user_id: ticket.user_id,
        ticket_id: ticketId,
        type: "status_update",
        reference_id: log.id,
      },
    });
  }

  // When done: notify the technician with points earned + send customer email
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

  // Send email to customer on every status change
  const fullTicket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (fullTicket) {
    const customerEmail = fullTicket.customer_email || fullTicket.user.email;
    const customerName = fullTicket.customer_name || fullTicket.user.name;
    if (customerEmail && ticket.user_id !== session.userId) {
      await sendTicketStatusEmail({
        to: customerEmail,
        customerName,
        ticketCode: ticket.ticket_code,
        status: newStatus,
        shareToken: fullTicket.public_share_token,
      });
    }
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
