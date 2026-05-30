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

// ─── Request Ticket Assignment (Technician) ────────────────────────────────
export async function requestTicketAssignmentAction(ticketId: string) {
  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, technician_id: true, status: true, ticket_type: true, ticket_code: true },
  });
  if (!ticket) return { error: "Ticket not found" };
  if (ticket.technician_id) return { error: "Ticket already assigned" };
  if (ticket.status !== "waiting") return { error: "Ticket is not in waiting status" };

  // Workload check removed: Technicians can request freely as assignments are gated.

  // Check if request already exists
  const existingRequest = await db.ticketAssignmentRequest.findUnique({
    where: { ticket_id_technician_id: { ticket_id: ticketId, technician_id: session.userId } },
  });

  if (existingRequest) {
    return { error: "You have already requested this ticket." };
  }

  // Create Assignment Request
  await db.ticketAssignmentRequest.create({
    data: {
      ticket_id: ticketId,
      technician_id: session.userId,
    },
  });

  // Notify Admins and Team Leaders
  const adminsAndLeaders = await db.user.findMany({
    where: {
      OR: [
        { role: "Administrator" },
        { is_team_leader: true }
      ]
    },
    select: { id: true },
  });
  
  for (const admin of adminsAndLeaders) {
    await db.notification.create({
      data: {
        user_id: admin.id,
        ticket_id: ticketId,
        type: "status_update",
        message: `🙋 Someone Request to handle Ticket #${ticket.ticket_code}`,
      },
    });
  }

  revalidatePath("/technician/dashboard");
  return { success: true };
}

// ─── Update Ticket Status ──────────────────────────────────────────────────
export async function updateTicketStatusAction(formData: FormData) {
  const ticketId = formData.get("ticketId") as string;
  const newStatus = formData.get("newStatus") as "on_progress" | "done" | "cancelled" | "rejected";
  const reason = formData.get("reason") as string | null;
  const eventAction = formData.get("eventAction") as "START" | "PAUSE" | "RESUME" | "DONE" | null;
  const files = formData.getAll("files") as File[];

  const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { error: "Ticket not found" };

  // Only assigned technician can change status
  if (ticket.technician_id !== session.userId) {
    return { error: "You are not assigned to this ticket" };
  }

  // Validation rules
  if (newStatus === "on_progress" && ticket.status !== "waiting" && ticket.status !== "on_progress") {
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

  if (eventAction) {
    await db.ticketTimeLog.create({
      data: {
        ticket_id: ticketId,
        event: eventAction,
        reason: reason || null,
      }
    });
  }

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

      if (error) return null;

      const {
        data: { publicUrl },
      } = supabase.storage.from("attachments").getPublicUrl(data.path);

      let fileType: "image" | "video" | "pdf" = "pdf";
      if (file.type.startsWith("image/")) fileType = "image";
      if (file.type.startsWith("video/")) fileType = "video";

      await db.ticketAttachment.create({
        data: { ticket_id: ticketId, file_url: publicUrl, file_type: fileType },
      });

      return { publicUrl, fileType };
    });
    const uploadedFiles = await Promise.all(uploadOps);

    // Save first image as first_build_url for PC build ticket when marked done
    if (newStatus === "done" && ticket.ticket_type === "pc_build") {
      const firstImage = uploadedFiles.find((f) => f && f.fileType === "image");
      if (firstImage) {
        await db.ticketPcBuildDetail.upsert({
          where: { ticket_id: ticketId },
          create: { ticket_id: ticketId, first_build_url: firstImage.publicUrl },
          update: { first_build_url: firstImage.publicUrl },
        });
      }
    }
  }

  // Update workload + performance when terminal
  const isTerminal = ["done", "cancelled", "rejected"].includes(newStatus);
  if (isTerminal) {
    const points = getTicketPoints(ticket.ticket_type);

    // Workload reduction removed: tracked dynamically

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

  // Create notification for customer if ticket is tied to a user account
  if (ticket.user_id && ticket.user_id !== session.userId) {
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
    const customerEmail = fullTicket.customer_email || fullTicket.user?.email;
    const customerName = fullTicket.customer_name || fullTicket.user?.name;
    if (customerEmail && ticket.user_id !== session.userId) {
      await sendTicketStatusEmail({
        to: customerEmail,
        customerName: customerName || "Customer",
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
