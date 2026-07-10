"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { sendTicketStatusEmail } from "@/lib/email";

function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

// ─── Request Ticket Assignment (Technician) ────────────────────────────────
export async function requestTicketAssignmentAction(ticketId: string) {
  const session = await requireRole("Technician");

  const [ticket, currentUser] = await Promise.all([
    db.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, technician_id: true, status: true, ticket_type: true, ticket_code: true },
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { is_team_leader: true },
    }),
  ]);

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.technician_id) return { error: "Ticket already assigned" };
  if (ticket.status !== "waiting") return { error: "Ticket is not in waiting status" };

  // ── Coordinator shortcut: auto-assign without going through request queue ──
  if (currentUser?.is_team_leader) {
    await db.ticket.update({
      where: { id: ticketId },
      data: { technician_id: session.userId },
    });
    await db.ticketStatusLog.create({
      data: {
        ticket_id: ticketId,
        old_status: "waiting",
        new_status: "waiting",
        reason: "Auto-assigned by Store Coordinator",
        changed_by: session.userId,
      },
    });
    revalidatePath("/technician/dashboard");
    revalidatePath(`/technician/tickets/${ticketId}`);
    revalidatePath(`/admin/tickets/${ticketId}`);
    return { success: true };
  }

  // ── Regular technician: create request and notify admins ──────────────────

  // Block if ANY technician already has a pending request for this ticket (1 at a time rule)
  const anyPendingRequest = await db.ticketAssignmentRequest.findFirst({
    where: { ticket_id: ticketId, status: "pending" },
    select: { technician_id: true },
  });

  if (anyPendingRequest) {
    if (anyPendingRequest.technician_id === session.userId) {
      return { error: "You have already requested this ticket." };
    }
    return { error: "Another technician has already requested this ticket." };
  }

  // Create Assignment Request (upsert handles the case where a prior rejected
  // record already exists for this technician + ticket — avoids unique constraint crash)
  await db.ticketAssignmentRequest.upsert({
    where: {
      ticket_id_technician_id: {
        ticket_id: ticketId,
        technician_id: session.userId,
      },
    },
    create: {
      ticket_id: ticketId,
      technician_id: session.userId,
      status: "pending",
    },
    update: {
      status: "pending",
      created_at: new Date(),
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

// ─── Cancel Ticket Assignment Request (Technician) ─────────────────────────
export async function cancelTicketRequestAction(ticketId: string) {
  const session = await requireRole("Technician");

  const request = await db.ticketAssignmentRequest.findUnique({
    where: { ticket_id_technician_id: { ticket_id: ticketId, technician_id: session.userId } },
  });

  if (!request) return { error: "No pending request found for this ticket." };
  if (request.status !== "pending") return { error: "Request already handled, cannot cancel." };

  await db.ticketAssignmentRequest.delete({
    where: { id: request.id },
  });

  revalidatePath("/technician/dashboard");
  return { success: true };
}


// ─── Update Ticket Status ──────────────────────────────────────────────────
export async function updateTicketStatusAction(formData: FormData) {
  try {
    const ticketId = formData.get("ticketId") as string;
    const newStatus = formData.get("newStatus") as
      | "on_progress" | "done" | "cancelled" | "rejected"
      | "ready_for_pickup" | "waiting_pickup" | "handed_to_courier" | "delivered" | "completed";
    const reason = formData.get("reason") as string | null;
    const eventAction = formData.get("eventAction") as "START" | "PAUSE" | "RESUME" | "DONE" | null;
    const files = formData.getAll("files") as File[];

    const session = await requireRole("Technician");

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { error: "Ticket not found" };

  if (ticket.technician_id !== session.userId) {
    return { error: "You are not assigned to this ticket" };
  }

  const HANDOVER_CHAIN: Record<string, string> = {
    on_progress:       "waiting",
    done:              "on_progress",
    ready_for_pickup:  "done",
    handed_to_courier: "done",
    delivered:         "handed_to_courier",
    completed:         "ready_for_pickup",
  };

  const allowedPrevious = HANDOVER_CHAIN[newStatus];
  const isValidTransition =
    newStatus === "cancelled" ||
    newStatus === "rejected" ||
    ticket.status === allowedPrevious ||
    (newStatus === "on_progress" && ticket.status === "on_progress") ||
    (newStatus === "completed" && (ticket.status === "waiting_pickup" || ticket.status === "delivered"));

  if (!isValidTransition) {
    return { error: `Cannot move to "${newStatus}" from "${ticket.status}"` };
  }

  const requiresProof =
    newStatus === "handed_to_courier" ||
    newStatus === "delivered" ||
    (newStatus === "completed" && ticket.status === "ready_for_pickup");

  const validFiles = files.filter((f) => f.size > 0);
  if (requiresProof && validFiles.length === 0) {
    return { error: "Proof attachment is required for this step." };
  }

  // ── Handle Attachments FIRST ──
  let uploadedFiles: { publicUrl: string, fileType: "image" | "video" | "pdf" }[] = [];
  
  if (validFiles.length > 0) {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();

    const proofPrefix: Record<string, string> = {
      done:              "work-proof",
      handed_to_courier: "courier-proof",
      completed:         "pickup-proof",
      delivered:         "delivery-proof",
      cancelled:         "cancel-proof",
      rejected:          "cancel-proof",
    };
    const prefix = proofPrefix[newStatus] ?? "attachment";

    const uploadOps = validFiles.map(async (file) => {
      const mimeToExt: Record<string, string> = {
        "image/webp": "webp",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "video/webm": "webm",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "application/pdf": "pdf",
      };
      const ext = mimeToExt[file.type] || file.name.split(".").pop()?.toLowerCase() || "bin";
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase().slice(0, 40);
      const path = `${ticketId}/${prefix}_${ticket.ticket_code}_${baseName}.${ext}`;

      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type });

      if (error) {
        throw new Error(`Upload failed for ${file.name}`);
      }

      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(data.path);

      let fileType: "image" | "video" | "pdf" = "pdf";
      if (file.type.startsWith("image/")) fileType = "image";
      if (file.type.startsWith("video/")) fileType = "video";

      return { publicUrl, fileType };
    });

    try {
      uploadedFiles = await Promise.all(uploadOps);
    } catch (err) {
      console.error("[UPLOAD ERROR]", err);
      return { error: "Failed to upload proof attachment. Please check file size and try again." };
    }
  }

  // ── Database Updates ──
  const oldStatus = ticket.status;
  const ticketUpdateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "on_progress") ticketUpdateData.work_started_at = new Date();
  if (newStatus === "done") ticketUpdateData.work_completed_at = new Date();

  // We write DB operations synchronously/in parallel once we know attachments are safe
  const dbOps: Promise<unknown>[] = [
    db.ticket.update({
      where: { id: ticketId },
      data: ticketUpdateData as any,
    }),
    db.ticketStatusLog.create({
      data: {
        ticket_id: ticketId,
        old_status: oldStatus,
        new_status: newStatus,
        reason: reason || null,
        changed_by: session.userId,
      },
    })
  ];

  if (eventAction) {
    dbOps.push(db.ticketTimeLog.create({
      data: { ticket_id: ticketId, event: eventAction, reason: reason || null },
    }));
  }

  if (uploadedFiles.length > 0) {
    dbOps.push(
      db.ticketAttachment.createMany({
        data: uploadedFiles.map(f => ({
          ticket_id: ticketId,
          file_url: f.publicUrl,
          file_type: f.fileType,
        }))
      })
    );
  }

  // Execute DB changes
  const [updatedTicket, logResult] = await Promise.all(dbOps) as any;
  const log = logResult; // Extract log from array positions 

  if (newStatus === "delivered") {
    await db.ticket.update({ where: { id: ticketId }, data: { status: "completed" } });
    await db.ticketStatusLog.create({
      data: {
        ticket_id: ticketId,
        old_status: "delivered",
        new_status: "completed",
        reason: "Auto-completed after delivery confirmation",
        changed_by: session.userId,
      },
    });
  }

  const isTerminal = ["done", "cancelled", "rejected"].includes(newStatus);
  if (isTerminal) {
    const points = getTicketPoints(ticket.ticket_type, ticket.device_type);

    revalidateTag("leaderboard-techs", "max");
    revalidateTag("leaderboard-stores", "max");
    revalidateTag("tech-month-winner", "max");
    revalidateTag(`user-profile:${session.userId}`, "max");

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

  if (newStatus === "done") {
    const points = getTicketPoints(ticket.ticket_type, ticket.device_type);
    revalidateTag(`user-profile:${session.userId}`, "max");
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

  db.ticket.findUnique({
    where: { id: ticketId },
    select: { customer_email: true, customer_name: true, public_share_token: true },
  }).then(async (fullTicket) => {
    if (!fullTicket?.customer_email) return;

    const { headers } = await import("next/headers");
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const appUrl = `${protocol}://${host}`;

    sendTicketStatusEmail({
      to: fullTicket.customer_email,
      customerName: fullTicket.customer_name || "Customer",
      ticketCode: ticket.ticket_code,
      status: newStatus,
      shareToken: fullTicket.public_share_token,
      appUrl
    }).catch((err) => console.error("[EMAIL FIRE-AND-FORGET ERROR]", err));
  }).catch(() => {});

  revalidatePath(`/technician/tickets/${ticketId}`);
  revalidatePath(`/customer/tickets/${ticketId}`);
  return { success: true };
  } catch (err: any) {
    console.error("[updateTicketStatusAction Error]:", err);
    return { error: err.message || "An internal server error occurred" };
  }
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
