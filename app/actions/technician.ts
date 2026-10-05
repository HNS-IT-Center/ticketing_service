"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { sendTicketStatusEmail } from "@/lib/email";
import { uploadToR2, getExt, getFileType, deleteFromStorage } from "@/lib/r2";
import { performanceEffect } from "@/lib/kpi";
import { getTicketPoints } from "@/lib/points";
import { isServicePart, requiresItemName, MAX_PART_PHOTOS } from "@/lib/service-parts";


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

  // ── One pending request per ticket, enforced atomically ───────────────────
  //
  // Checking with `findFirst` and then creating is a read-then-write across two
  // statements. Two technicians clicking at the same moment both saw no pending
  // request and both inserted one: the unique index is on
  // `(ticket_id, technician_id)`, and their technician ids differ, so nothing
  // stopped the second. Proven against the local database — two pending rows on
  // one ticket.
  //
  // MariaDB has no partial unique index, so the rule that actually wants
  // enforcing — one pending row per `ticket_id` — cannot be written as a
  // constraint. Locking the ticket row for the duration instead makes the check
  // and the insert a single step, and serialises every requester behind the
  // ticket they are competing for. The ticket's own state is re-read inside the
  // lock too, because it can be assigned between the read above and this point.
  const claim = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Ticket WHERE id = ${ticketId} FOR UPDATE`;

    const fresh = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { technician_id: true, status: true },
    });
    if (!fresh) return { error: "Ticket not found" as const };
    if (fresh.technician_id) return { error: "Ticket already assigned" as const };
    if (fresh.status !== "waiting") {
      return { error: "Ticket is not in waiting status" as const };
    }

    const anyPendingRequest = await tx.ticketAssignmentRequest.findFirst({
      where: { ticket_id: ticketId, status: "pending" },
      select: { technician_id: true },
    });

    if (anyPendingRequest) {
      return anyPendingRequest.technician_id === session.userId
        ? { error: "You have already requested this ticket." as const }
        : { error: "Another technician has already requested this ticket." as const };
    }

    // `upsert` handles the case where a prior rejected record already exists for
    // this technician + ticket — avoids a unique constraint crash.
    await tx.ticketAssignmentRequest.upsert({
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

    return { ok: true as const };
  });

  if ("error" in claim) return { error: claim.error };

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

    const ticket = await db.ticket.findUnique({ 
      where: { id: ticketId },
      include: { cleaning_detail: true }
    });
    if (!ticket) return { error: "Ticket not found" };

    if (ticket.technician_id !== session.userId) {
      return { error: "You are not assigned to this ticket" };
    }

    // ── Guard 1: a ticket sitting with the RMA desk is driven from the RMA
    // portal only. The technician regains control once the case closes and the
    // ticket returns to `done`.
    if (ticket.status === "rma_process") {
      return {
        error:
          "Tiket ini sedang diproses RMA. Status hanya dapat diubah dari portal RMA sampai case-nya ditutup.",
      };
    }

    // ── Guard 2: rejecting always needs a reason, enforced server side rather
    // than trusting the dialog to have asked for one.
    if (newStatus === "rejected" && !reason?.trim()) {
      return { error: "Alasan wajib diisi saat menolak tiket." };
    }

    // ── Guard 3: a warranty claim has exactly ONE way out of `on_progress` —
    // handover to RMA (handoverToRmaAction).
    //
    // The technician used to be able to close a claim as "not eligible" here.
    // That decision moved to the RMA desk, which is the side that knows what a
    // vendor's warranty actually covers. The technician examines the unit and
    // documents it; the desk judges it. So `done` on a claim is refused outright
    // rather than asked for a reason.
    if (ticket.ticket_type === "warranty_claim" && newStatus === "done") {
      return {
        error:
          "Tiket klaim tidak bisa diselesaikan dari sini. Serahkan unit ke RMA — " +
          "kelayakan klaim diputuskan tim RMA.",
      };
    }

    const HANDOVER_CHAIN: Record<string, string> = {
      on_progress: "waiting",
      done: "on_progress",
      ready_for_pickup: "done",
      handed_to_courier: "done",
      delivered: "handed_to_courier",
      completed: "ready_for_pickup",
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
      const proofPrefix: Record<string, string> = {
        done: "work-proof",
        handed_to_courier: "courier-proof",
        completed: "pickup-proof",
        delivered: "delivery-proof",
        cancelled: "cancel-proof",
        rejected: "cancel-proof",
      };
      const prefix = proofPrefix[newStatus] ?? "attachment";

      const uploadOps = validFiles.map(async (file) => {
        const ext = getExt(file.type, file.name);
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase().slice(0, 40);
        const path = `tickets/${ticketId}/${prefix}_${ticket.ticket_code}_${baseName}.${ext}`;

        const publicUrl = await uploadToR2(file, path);
        const fileType = getFileType(file.type);

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
      // The active-ticket count on the profile changes whatever the verdict is.
      revalidateTag("leaderboard-techs", "max");
      revalidateTag("leaderboard-stores", "max");
      revalidateTag("tech-month-winner", "max");
      revalidateTag(`user-profile:${session.userId}`, "max");
    }

    // A claim is paid once, at handover to RMA. Nothing this action does to a
    // claim credits anything. See lib/kpi.ts.
    const effect = performanceEffect(ticket.ticket_type, newStatus);
    if (effect !== "ignore") {
      const points = getTicketPoints(ticket.ticket_type, ticket.device_type, ticket.cleaning_detail?.service_package);

      const isSuccess = effect === "success";
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

    if (effect === "success") {
      const points = getTicketPoints(ticket.ticket_type, ticket.device_type, ticket.cleaning_detail?.service_package);
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
      const host = headersList.get("host");
      const protocol = headersList.get("x-forwarded-proto") || "https";
      const appUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "");

      sendTicketStatusEmail({
        to: fullTicket.customer_email,
        customerName: fullTicket.customer_name || "Customer",
        ticketCode: ticket.ticket_code,
        status: newStatus,
        shareToken: fullTicket.public_share_token,
        appUrl
      }).catch((err) => console.error("[EMAIL FIRE-AND-FORGET ERROR]", err));
    }).catch(() => { });

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

// ─── Replaced Parts (Technician, service tickets) ───────────────────────────

/**
 * Record a component the technician replaced during a service.
 *
 * Only the technician the ticket is assigned to may add one, and only on a
 * `service` ticket — the other types have their own detail tables and none of
 * them means "a part was fitted".
 *
 * The category comes from the `ServicePart` enum and the item name is free
 * text beside it. That split is the whole point: `device_name` and
 * `vendor_name` are free text and both splintered into variants of the same
 * thing, which is why the dashboard's brand chart had to be withdrawn. A
 * category can be counted; prose cannot.
 */
export async function addReplacedPartAction(formData: FormData) {
  const session = await requireRole("Technician");

  const ticketId = String(formData.get("ticket_id") ?? "");
  const part = String(formData.get("part") ?? "");
  const itemName = String(formData.get("item_name") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const photos = (formData.getAll("photos") as File[]).filter((f) => f.size > 0);

  if (!isServicePart(part)) {
    return { error: "Jenis part tidak dikenal." };
  }

  if (photos.length > MAX_PART_PHOTOS) {
    return { error: `Maksimal ${MAX_PART_PHOTOS} foto per part.` };
  }
  // Images only: this is a picture of a box and a label, and allowing video
  // here would let a technician attach a clip the panel cannot preview.
  const notAnImage = photos.find((f) => !f.type.startsWith("image/"));
  if (notAnImage) {
    return { error: "Foto part harus berupa gambar." };
  }

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, ticket_code: true, technician_id: true, ticket_type: true, status: true },
  });

  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.technician_id !== session.userId) {
    return { error: "Hanya teknisi yang memegang tiket ini yang dapat mencatat penggantian part." };
  }
  if (ticket.ticket_type !== "service") {
    return { error: "Penggantian part hanya dicatat pada tiket service." };
  }

  const trimmedName = itemName.trim();
  // `other` carries no meaning by itself, so the name is what says what was
  // fitted. Every named category already describes itself.
  if (requiresItemName(part) && !trimmedName) {
    return { error: "Nama barang wajib diisi bila jenis part-nya Lainnya." };
  }

  // Uploaded before the row exists, the same way handoverToRmaAction does it:
  // a failed upload then leaves nothing behind rather than a part record
  // pointing at photos that were never stored.
  const photoUrls: string[] = [];
  for (const [i, file] of photos.entries()) {
    const ext = getExt(file.type, file.name);
    const path = `tickets/${ticketId}/part-${part}_${ticket.ticket_code}_${Date.now()}_${i + 1}.${ext}`;
    try {
      photoUrls.push(await uploadToR2(file, path));
    } catch (err) {
      console.error("[REPLACED PART PHOTO UPLOAD ERROR]", err);
      return { error: "Gagal mengunggah foto part. Periksa ukuran file lalu coba lagi." };
    }
  }

  await db.ticketReplacedPart.create({
    data: {
      ticket_id: ticketId,
      part,
      item_name: trimmedName || null,
      notes: notes.trim() || null,
      recorded_by_id: session.userId,
      photos: { create: photoUrls.map((file_url) => ({ file_url })) },
    },
  });

  revalidatePath(`/technician/tickets/${ticketId}`);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

/**
 * Remove a part the technician recorded by mistake.
 *
 * Scoped to the person who recorded it AND to the ticket they still hold, so
 * a technician cannot delete a colleague's entry by guessing an id.
 */
export async function removeReplacedPartAction(partId: string) {
  const session = await requireRole("Technician");

  const existing = await db.ticketReplacedPart.findUnique({
    where: { id: partId },
    select: {
      id: true,
      recorded_by_id: true,
      ticket_id: true,
      ticket: { select: { technician_id: true } },
      photos: { select: { file_url: true } },
    },
  });

  if (!existing) return { error: "Catatan part tidak ditemukan." };
  if (
    existing.recorded_by_id !== session.userId ||
    existing.ticket.technician_id !== session.userId
  ) {
    return { error: "Hanya teknisi yang mencatatnya yang dapat menghapus catatan ini." };
  }

  // The photo rows cascade with the part; the files in the bucket do not, so
  // they are removed here. Best effort and after the delete: the record is
  // already gone, and a storage error must not make a completed removal look
  // like it failed.
  await db.ticketReplacedPart.delete({ where: { id: partId } });

  for (const photo of existing.photos) {
    if (!(await deleteFromStorage(photo.file_url))) {
      console.error(`[removeReplacedPart] berkas tertinggal: ${photo.file_url}`);
    }
  }

  revalidatePath(`/technician/tickets/${existing.ticket_id}`);
  revalidatePath(`/admin/tickets/${existing.ticket_id}`);
  return { success: true };
}
