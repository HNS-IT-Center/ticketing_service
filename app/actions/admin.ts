"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/session";
import { sendTicketStatusEmail } from "@/lib/email";
import {
  EARNING_STATUS_LOG_FILTER,
  PERFORMANCE_FAILURE_STATUSES,
  performanceEffect,
} from "@/lib/kpi";
import { getTicketPoints } from "@/lib/points";
import { deleteFromStorage } from "@/lib/r2";

// ─── Create User ───────────────────────────────────────────────────────────
export async function createUserAction(formData: FormData) {
  await requireRole("Administrator");

  const data = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    phone_number: formData.get("phone_number") as string,
    address: formData.get("address") as string,
    role: formData.get("role") as string,
    password: formData.get("password") as string,
  };

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) return { error: "Email already in use" };

  const hashedPassword = await bcrypt.hash(data.password, 12);

  const user = await db.user.create({
    data: {
      ...data,
      role: data.role as any,
      password: hashedPassword,
    },
  });

  if (data.role === "Technician") {
    await db.technicianPerformance.create({
      data: { technician_id: user.id },
    });
  }

  revalidatePath("/admin/users");
  return { success: true, userId: user.id };
}

// ─── Update User ───────────────────────────────────────────────────────────
export async function updateUserAction(userId: string, formData: FormData) {
  await requireRole("Administrator");

  const shift = formData.get("shift") as string | null;
  const work_days = formData.get("work_days") as string | null;
  const max_points = formData.get("max_points") as string | null;
  const is_team_leader = formData.get("is_team_leader") === "1";

  if (is_team_leader) {
    const stores = await db.technicianStoreAssignment.findMany({
      where: { technician_id: userId },
      select: { store_id: true }
    });
    for (const assignment of stores) {
      const existingLeader = await db.technicianStoreAssignment.findFirst({
        where: {
          store_id: assignment.store_id,
          technician_id: { not: userId },
          technician: { is_team_leader: true }
        }
      });
      if (existingLeader) {
        return { error: "One of the assigned stores already has a Team Leader. Max 1 Team Leader per store." };
      }
    }
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone_number: formData.get("phone_number") as string,
      address: formData.get("address") as string,
      role: formData.get("role") as any,
      shift: shift ? (shift as any) : null,
      work_days: work_days ? JSON.parse(work_days) : null,
      is_team_leader,
    },
  });

  // Workload setting removed

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}

// ─── Check User Deletion (pre-flight) ────────────────────────────────────────
// Called before showing the delete modal to surface any active tickets that
// need to be reassigned before the user can be deactivated.
export async function checkUserDeletionAction(userId: string) {
  await requireRole("Administrator");

  const activeTickets = await db.ticket.findMany({
    where: {
      technician_id: userId,
      status: { in: ["waiting", "on_progress"] },
    },
    select: { id: true, ticket_code: true, ticket_type: true, status: true },
    orderBy: { created_at: "desc" },
  });

  return { activeTickets };
}

// ─── Deactivate (Soft-Delete) User ───────────────────────────────────────────
// 1. Optionally bulk-reassigns active tickets to another technician.
// 2. Soft-deletes the user (is_active = false, email scrambled).
export async function deactivateUserAction(
  userId: string,
  reassignToTechnicianId?: string | null
) {
  const session = await requireRole("Administrator");

  // Guard: admin cannot delete themselves
  if (userId === session.userId) {
    return { error: "You cannot deactivate your own account." };
  }

  // Step 1: Reassign active tickets if a replacement is specified
  if (reassignToTechnicianId) {
    await db.ticket.updateMany({
      where: {
        technician_id: userId,
        status: { in: ["waiting", "on_progress"] },
      },
      data: { technician_id: reassignToTechnicianId },
    });
  }

  // Step 2: Soft-delete — deactivate the account and free up the email slot
  await db.user.update({
    where: { id: userId },
    data: {
      is_active: false,
      // Scramble email so the address can be re-registered if needed
      email: `${userId}__deleted__@deactivated.local`,
    },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Admin Assign Ticket ────────────────────────────────────────────────────
export async function adminAssignTicketAction(
  ticketId: string,
  technicianId: string | null,
  salesId: string | null
) {
  const session = await requireSession();
  
  if (session.role !== "Administrator") {
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { is_team_leader: true } });
    if (!user?.is_team_leader) {
      throw new Error("Unauthorized");
    }
  }

  // Guard: cannot reassign technician once work has started
  const existingTicket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true, technician_id: true, ticket_code: true },
  });
  if (!existingTicket) return { error: "Ticket not found" };
  
  if (existingTicket.status !== "waiting") {
    // If work started, we ONLY allow updating the Sales assignment
    if (technicianId !== existingTicket.technician_id) {
      return { error: "Technician cannot be changed once work has started." };
    }
  }

  // 1. Update ticket assignment
  const ticket = await db.ticket.update({
    where: { id: ticketId },
    data: {
      technician_id: technicianId || null,
      sales_id: salesId || null,
    },
    select: { ticket_code: true }
  });

  // 2. Resolve pending requests
  if (technicianId) {
    await db.ticketAssignmentRequest.updateMany({
      where: { ticket_id: ticketId, technician_id: technicianId, status: "pending" },
      data: { status: "approved" },
    });
    // Reject others
    await db.ticketAssignmentRequest.updateMany({
      where: { ticket_id: ticketId, technician_id: { not: technicianId }, status: "pending" },
      data: { status: "rejected" },
    });
    
    // Notify assigned tech
    await db.notification.create({
      data: {
        user_id: technicianId,
        ticket_id: ticketId,
        type: "assigned",
        message: `Admin assigned you to ticket #${ticket.ticket_code}`,
      }
    });
  } else {
    // If unassigned, just reject all pending
    await db.ticketAssignmentRequest.updateMany({
      where: { ticket_id: ticketId, status: "pending" },
      data: { status: "rejected" },
    });
  }

  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

// ─── Snapshot Leaderboard ──────────────────────────────────────────────────
export async function snapshotLeaderboardAction(month: number, year: number) {
  await requireRole("Administrator");

  // Delete existing snapshot for this month/year
  await db.leaderboard.deleteMany({ where: { month, year } });

  // Get all technicians with performance
  const technicians = await db.technicianPerformance.findMany({
    include: { technician: { select: { name: true } } },
  });

  // Create snapshots
  if (technicians.length > 0) {
    await db.leaderboard.createMany({
      data: technicians.map((t) => ({
        technician_id: t.technician_id,
        month,
        year,
        total_points: t.total_points_completed,
        tickets_handled: t.tickets_handled,
      })),
    });
  }

  revalidatePath("/admin/leaderboard");
  return { success: true };
}
// ─── Admin Update Ticket Status ────────────────────────────────────────────
export async function adminUpdateTicketStatusAction(
  ticketId: string,
  newStatus: "waiting" | "on_progress" | "cancelled" | "rejected" | "done" |
             "ready_for_pickup" | "waiting_pickup" | "handed_to_courier" | "delivered" | "completed",
  reason?: string
) {
  const session = await requireRole("Administrator", "Sales");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { 
      user: { select: { name: true, email: true } },
      cleaning_detail: true 
    },
  });
  if (!ticket) return { error: "Ticket not found" };

  // A ticket sitting with the RMA desk is driven from the RMA portal only. The
  // same guard exists in updateTicketStatusAction for technicians; without it
  // here, that one is trivially bypassed by asking an administrator, and the
  // ticket would drift out of `rma_process` while its RmaCase is still open.
  // The legitimate way to abandon a claim is transitionRmaAction -> cancelled,
  // which closes the case and returns the ticket to `done` itself.
  if (ticket.status === "rma_process") {
    return {
      error:
        "Tiket ini sedang diproses RMA. Status hanya dapat diubah dari portal RMA sampai case-nya ditutup.",
    };
  }

  // Mirrors guard 3 in updateTicketStatusAction. A warranty claim leaves
  // `waiting`/`on_progress` one way only: handover to the RMA desk, which is
  // the side that decides eligibility.
  //
  // This used to ask an administrator for a reason and record the claim as
  // ineligible on their word. That decision moved to the desk, so the admin
  // portal now refuses the move outright rather than offering a second, quieter
  // way to make it.
  //
  // A claim already past `done` is excluded on purpose: moving one along the
  // handover chain is not an eligibility decision. `rma_process` never reaches
  // this line — the guard above returns first.
  if (
    ticket.ticket_type === "warranty_claim" &&
    (ticket.status === "waiting" || ticket.status === "on_progress") &&
    newStatus === "done"
  ) {
    return {
      error:
        "Tiket klaim tidak bisa diselesaikan dari portal ini. Serahkan unit ke RMA — " +
        "kelayakan klaim diputuskan tim RMA.",
    };
  }

  await db.$transaction([
    db.ticket.update({
      where: { id: ticketId },
      data: { status: newStatus },
    }),
    db.ticketStatusLog.create({
      data: {
        ticket_id: ticketId,
        old_status: ticket.status,
        new_status: newStatus,
        reason: reason?.trim() || null,
        changed_by: session.userId,
      },
    }),
  ]);

  // Update technician performance if closing a ticket.
  //
  // `completed` used to be in this list, with a point table of its own that
  // disagreed with every other one in the codebase. An administrator moving a
  // ticket `ready_for_pickup` -> `completed` therefore credited the technician
  // a second time, for every ticket type, on top of the credit they already
  // got at `done`. The extra credit is gone; the rule now lives in lib/kpi.ts.
  const effect = performanceEffect(ticket.ticket_type, newStatus);
  if (effect !== "ignore" && ticket.technician_id) {
    // This table is this action's own, and disagrees with both the writers' one
    // in technician.ts and the display one in lib/leaderboard.ts. Left as it is
    // deliberately: changing it changes credited points, which belongs to
    // fix/points-table-unification, not to this branch.
    let points = 3; // default 'others'
    if (ticket.ticket_type === "service" || ticket.ticket_type === "pc_build") {
      points = 4;
    } else if (ticket.ticket_type === "warranty_claim") {
      points = 2;
    } else if (ticket.ticket_type === "cleaning" && ticket.cleaning_detail?.service_package === "Deep_Clean") {
      points = 4;
    }
    const isSuccess = effect === "success";
    await db.technicianPerformance.update({
      where: { technician_id: ticket.technician_id },
      data: {
        tickets_handled: { increment: 1 },
        success_count: isSuccess ? { increment: 1 } : undefined,
        failed_count: isSuccess ? undefined : { increment: 1 },
        total_points_completed: isSuccess ? { increment: points } : undefined,
      },
    });
    // Workload decrement removed
  }

  if (effect !== "ignore" && ticket.technician_id) {
    revalidateTag("leaderboard-techs", "max");
    revalidateTag("leaderboard-stores", "max");
    revalidateTag("tech-month-winner", "max");
    revalidateTag(`user-profile:${ticket.technician_id}`, "max");
  }

  // Notify customer if they have a user account
  if (ticket.user_id) {
    await db.notification.create({
      data: {
        user_id: ticket.user_id,
        ticket_id: ticketId,
        type: "status_update",
      },
    });
  }

  // Fire email non-blocking — do NOT await it
  // Use only the customer_email entered at ticket creation, never the account owner's email.
  if (ticket.customer_email) {
    sendTicketStatusEmail({
      to: ticket.customer_email,
      customerName: ticket.customer_name || "Customer",
      ticketCode: ticket.ticket_code,
      status: newStatus,
      shareToken: ticket.public_share_token,
    }).catch((err) => console.error("[EMAIL FIRE-AND-FORGET ERROR]", err));
  }

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin/tickets");
  return { success: true };
}

// ─── Toggle Public Chat ─────────────────────────────────────────────────────
export async function togglePublicChatAction(ticketId: string, enabled: boolean) {
  await requireRole("Administrator", "Sales");
  await db.ticket.update({
    where: { id: ticketId },
    data: { public_chat_enabled: enabled },
  });
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

// ─── Delete Ticket (Administrator only, permanent) ──────────────────────────

/**
 * What deleting a ticket would destroy, so the confirmation dialog can say it
 * out loud instead of asking "are you sure?" over an unknown quantity.
 */
export async function checkTicketDeletionAction(ticketId: string) {
  await requireRole("Administrator");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      ticket_code: true,
      ticket_type: true,
      status: true,
      customer_name: true,
      technician: { select: { name: true } },
      store_location: { select: { code: true } },
      rma_case: { select: { rma_code: true, _count: { select: { events: true } } } },
      _count: {
        select: {
          status_logs: true,
          messages: true,
          attachments: true,
          time_logs: true,
        },
      },
    },
  });

  if (!ticket) return { error: "Tiket tidak ditemukan." };

  // Credits this ticket handed the technician, counted from the log rather than
  // from its current status: a warranty claim is paid at `rma_process` and then
  // moves on to `done`, so where it sits now does not say what it earned.
  // lib/kpi.ts owns that rule.
  const [earningLogs, failureLogs] = await Promise.all([
    db.ticketStatusLog.count({
      where: { ticket_id: ticketId, ...EARNING_STATUS_LOG_FILTER },
    }),
    db.ticketStatusLog.count({
      where: {
        ticket_id: ticketId,
        new_status: { in: [...PERFORMANCE_FAILURE_STATUSES] },
      },
    }),
  ]);

  return {
    ticket: {
      ticket_code: ticket.ticket_code,
      ticket_type: ticket.ticket_type,
      status: ticket.status,
      customer_name: ticket.customer_name,
      technician_name: ticket.technician?.name ?? null,
      store_code: ticket.store_location?.code ?? null,
    },
    destroys: {
      statusLogs: ticket._count.status_logs,
      messages: ticket._count.messages,
      attachments: ticket._count.attachments,
      timeLogs: ticket._count.time_logs,
      rmaCode: ticket.rma_case?.rma_code ?? null,
      rmaEvents: ticket.rma_case?._count.events ?? 0,
    },
    credits: {
      earningLogs,
      failureLogs,
      points: earningLogs * getTicketPoints(ticket.ticket_type, null, null),
    },
  };
}

/**
 * Permanently delete a ticket. Administrator only, and irreversible.
 *
 * The owner chose this over a soft delete on 2026-10-03, having been told what
 * it costs, so this code's job is to make the cost visible and recorded rather
 * than to prevent it:
 *
 * 1. **The audit trail goes.** Every relation to Ticket is `onDelete: Cascade`
 *    — status logs, messages, attachments, time logs, the per-type detail rows,
 *    and RmaCase with its whole RmaEvent trail. `DeletedTicketLog` is written
 *    first, in the same transaction, and holds no foreign key to Ticket so that
 *    it outlives it. Without that, nothing afterwards could answer "what
 *    happened to NGW-000123?".
 *
 * 2. **The two point figures would otherwise disagree.** The leaderboard is
 *    computed live from TicketStatusLog, so a deleted ticket leaves it at once;
 *    TechnicianPerformance is a stored counter with no relation to Ticket, so
 *    it would keep the credit forever. The counters are reversed here by the
 *    same lib/kpi.ts rule that granted them, and what was taken back is written
 *    on the audit row. Clamped at zero: counters that have already drifted
 *    (BL25) must not be driven negative.
 *
 * 3. **The files are not in the database.** Attachment URLs are removed from
 *    storage afterwards, best effort, and whatever could not be removed stays
 *    in the snapshot so an orphan in the bucket can still be traced back.
 */
export async function deleteTicketAction(
  ticketId: string,
  reason: string,
  confirmation: string
) {
  const session = await requireRole("Administrator");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      technician: { select: { id: true, name: true } },
      store_location: { select: { code: true } },
      attachments: { select: { file_url: true } },
      rma_case: { select: { rma_code: true, status: true } },
      _count: {
        select: { status_logs: true, messages: true, attachments: true, time_logs: true },
      },
    },
  });

  if (!ticket) return { error: "Tiket tidak ditemukan." };

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { error: "Alasan penghapusan wajib diisi." };
  }

  // Enforced on the server as well as in the dialog: a confirmation only the
  // browser checks is not a confirmation.
  if (confirmation.trim() !== ticket.ticket_code) {
    return {
      error: `Ketik kode tiket "${ticket.ticket_code}" persis seperti tertulis untuk mengonfirmasi.`,
    };
  }

  const [earningLogs, failureLogs] = await Promise.all([
    db.ticketStatusLog.count({
      where: { ticket_id: ticketId, ...EARNING_STATUS_LOG_FILTER },
    }),
    db.ticketStatusLog.count({
      where: {
        ticket_id: ticketId,
        new_status: { in: [...PERFORMANCE_FAILURE_STATUSES] },
      },
    }),
  ]);

  const pointsToReverse =
    earningLogs * getTicketPoints(ticket.ticket_type, ticket.device_type, null);
  const attachmentUrls = ticket.attachments.map((a) => a.file_url);

  await db.$transaction(async (tx) => {
    await tx.deletedTicketLog.create({
      data: {
        ticket_code: ticket.ticket_code,
        ticket_type: ticket.ticket_type,
        status: ticket.status,
        customer_name: ticket.customer_name,
        store_code: ticket.store_location?.code ?? null,
        technician_name: ticket.technician?.name ?? null,
        deleted_by_id: session.userId,
        deleted_by_name: session.name,
        reason: trimmedReason,
        points_reversed: pointsToReverse,
        success_reversed: earningLogs,
        failed_reversed: failureLogs,
        snapshot: {
          ticket_id: ticket.id,
          created_at: ticket.created_at.toISOString(),
          device_name: ticket.device_name,
          device_type: ticket.device_type,
          device_sn: ticket.device_sn,
          customer_email: ticket.customer_email,
          technician_id: ticket.technician?.id ?? null,
          rma_code: ticket.rma_case?.rma_code ?? null,
          rma_status: ticket.rma_case?.status ?? null,
          destroyed: {
            status_logs: ticket._count.status_logs,
            messages: ticket._count.messages,
            attachments: ticket._count.attachments,
            time_logs: ticket._count.time_logs,
          },
          attachment_urls: attachmentUrls,
        },
      },
    });

    // Take back what this ticket credited, so the stored counters and the
    // log-derived leaderboard keep telling the same story.
    if (ticket.technician?.id && (earningLogs > 0 || failureLogs > 0)) {
      const performance = await tx.technicianPerformance.findUnique({
        where: { technician_id: ticket.technician.id },
        select: {
          tickets_handled: true,
          success_count: true,
          failed_count: true,
          total_points_completed: true,
        },
      });

      if (performance) {
        const floor = (n: number) => (n < 0 ? 0 : n);
        await tx.technicianPerformance.update({
          where: { technician_id: ticket.technician.id },
          data: {
            tickets_handled: floor(
              performance.tickets_handled - earningLogs - failureLogs
            ),
            success_count: floor(performance.success_count - earningLogs),
            failed_count: floor(performance.failed_count - failureLogs),
            total_points_completed: floor(
              performance.total_points_completed - pointsToReverse
            ),
          },
        });
      }
    }

    // Everything else goes with it, through thirteen cascading relations.
    await tx.ticket.delete({ where: { id: ticketId } });
  });

  // After the transaction, and never allowed to fail it: the rows are already
  // gone, so a storage error must not make a completed delete look undone.
  const orphaned: string[] = [];
  for (const url of attachmentUrls) {
    if (!(await deleteFromStorage(url))) orphaned.push(url);
  }
  if (orphaned.length > 0) {
    console.error(
      `[deleteTicket] ${ticket.ticket_code}: ${orphaned.length} berkas tertinggal di storage`,
      orphaned
    );
  }

  if (ticket.technician?.id) {
    revalidateTag("leaderboard-techs", "max");
    revalidateTag("leaderboard-stores", "max");
    revalidateTag("tech-month-winner", "max");
    revalidateTag(`user-profile:${ticket.technician.id}`, "max");
  }
  revalidatePath("/admin/tickets");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    ticketCode: ticket.ticket_code,
    pointsReversed: pointsToReverse,
    orphanedFiles: orphaned.length,
  };
}
