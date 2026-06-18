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

  // Only assigned technician can change status
  if (ticket.technician_id !== session.userId) {
    return { error: "You are not assigned to this ticket" };
  }

  // ── New Handover Chain ──────────────────────────────────────────────────────
  // self-pickup path: done → ready_for_pickup → completed (proof of handover to customer)
  // courier path:    done → handed_to_courier (proof: package given to courier)
  //                       → delivered (proof: courier delivered to recipient)
  //                       → completed (auto, no separate button)
  const HANDOVER_CHAIN: Record<string, string> = {
    on_progress:       "waiting",
    done:              "on_progress",
    ready_for_pickup:  "done",
    handed_to_courier: "done",
    delivered:         "handed_to_courier",
    completed:         "ready_for_pickup", // self-pickup: upload proof → completed
  };

  const allowedPrevious = HANDOVER_CHAIN[newStatus];
  const isValidTransition =
    newStatus === "cancelled" ||
    newStatus === "rejected" ||
    ticket.status === allowedPrevious ||
    // resume after pause stays on_progress (time log event only, status unchanged)
    (newStatus === "on_progress" && ticket.status === "on_progress") ||
    // legacy compatibility: allow completed from waiting_pickup or delivered (old records)
    (newStatus === "completed" && (ticket.status === "waiting_pickup" || ticket.status === "delivered"));

  if (!isValidTransition) {
    return { error: `Cannot move to "${newStatus}" from "${ticket.status}"` };
  }

  // ── Proof file required for specific handover steps ──────────────────────
  // handed_to_courier: photo of handing package to courier
  // delivered:         receipt/photo confirming delivery to recipient
  // completed (from ready_for_pickup): photo of handing item to customer at counter
  const requiresProof =
    newStatus === "handed_to_courier" ||
    newStatus === "delivered" ||
    (newStatus === "completed" && ticket.status === "ready_for_pickup");

  const validFiles = files.filter((f) => f.size > 0);
  if (requiresProof && validFiles.length === 0) {
    return { error: "Proof attachment is required for this step." };
  }

  const oldStatus = ticket.status;

  // Track performance timestamps
  const ticketUpdateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "on_progress") ticketUpdateData.work_started_at = new Date();
  if (newStatus === "done") ticketUpdateData.work_completed_at = new Date();

  // Run the core DB writes in parallel
  const [, log] = await Promise.all([
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
    }),
    eventAction
      ? db.ticketTimeLog.create({
          data: { ticket_id: ticketId, event: eventAction, reason: reason || null },
        })
      : Promise.resolve(null),
  ]);

  // ── Handle Attachments ────────────────────────────────────────────────────
  if (validFiles.length > 0) {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();

    // Derive a readable proof-type prefix so the file is self-describing in storage
    const proofPrefix: Record<string, string> = {
      done:              "work-proof",
      handed_to_courier: "courier-proof",
      completed:         "pickup-proof",   // completed from ready_for_pickup
      delivered:         "delivery-proof",
      cancelled:         "cancel-proof",
      rejected:          "cancel-proof",
    };
    const prefix = proofPrefix[newStatus] ?? "attachment";

    const uploadOps = validFiles.map(async (file) => {
      // Derive extension from MIME type (reliable for camera files like HEIC/MOV)
      // After client-side compression, images are WebP and videos are WebM
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
      const ext =
        mimeToExt[file.type] ||
        file.name.split(".").pop()?.toLowerCase() ||
        "bin";
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase().slice(0, 40);
      const path = `${ticketId}/${prefix}_${ticket.ticket_code}_${baseName}.${ext}`;


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
    await Promise.all(uploadOps);
  }


  // ── Auto-complete after courier delivery proof ────────────────────────────
  // When "delivered" is confirmed (technician uploads delivery proof), the ticket
  // is immediately auto-advanced to "completed" — no separate button needed.
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

  // ── Performance tracking ──────────────────────────────────────────────────
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

  // ── Customer notification ─────────────────────────────────────────────────
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

  // When done: notify the technician with points earned
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

  // ── Fire email non-blocking ───────────────────────────────────────────────
  // Always send to the customer_email field on the ticket (entered at creation).
  // Never fall back to the staff member's account email.
  db.ticket.findUnique({
    where: { id: ticketId },
    select: { customer_email: true, customer_name: true, public_share_token: true },
  }).then((fullTicket) => {
    if (!fullTicket?.customer_email) return;
    sendTicketStatusEmail({
      to: fullTicket.customer_email,
      customerName: fullTicket.customer_name || "Customer",
      ticketCode: ticket.ticket_code,
      status: newStatus,
      shareToken: fullTicket.public_share_token,
    }).catch((err) => console.error("[EMAIL FIRE-AND-FORGET ERROR]", err));
  }).catch(() => {/* non-fatal */});

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
