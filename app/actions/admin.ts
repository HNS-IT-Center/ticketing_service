"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/session";
import { sendTicketStatusEmail } from "@/lib/email";

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

// ─── Delete User ───────────────────────────────────────────────────────────
export async function deleteUserAction(userId: string) {
  await requireRole("Administrator");
  await db.user.delete({ where: { id: userId } });
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
             "ready_for_pickup" | "waiting_pickup" | "handed_to_courier" | "delivered" | "completed"
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
        changed_by: session.userId,
      },
    }),
  ]);

  // Update technician performance if closing a ticket
  const isTerminal = ["done", "cancelled", "rejected", "completed"].includes(newStatus);
  if (isTerminal && ticket.technician_id) {
    let points = 3; // default 'others'
    if (ticket.ticket_type === "service" || ticket.ticket_type === "pc_build") {
      points = 4;
    } else if (ticket.ticket_type === "warranty_claim") {
      points = 2;
    } else if (ticket.ticket_type === "cleaning" && ticket.cleaning_detail?.service_package === "Deep_Clean") {
      points = 4;
    }
    await db.technicianPerformance.update({
      where: { technician_id: ticket.technician_id },
      data: {
        tickets_handled: { increment: 1 },
        success_count: newStatus === "done" || newStatus === "completed" ? { increment: 1 } : undefined,
        failed_count: newStatus !== "done" && newStatus !== "completed" ? { increment: 1 } : undefined,
        total_points_completed: (newStatus === "done" || newStatus === "completed") ? { increment: points } : undefined,
      },
    });
    // Workload decrement removed
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

  // Send email to customer if they have an email address
  const customerEmail = ticket.customer_email || ticket.user?.email;
  const customerName = ticket.customer_name || ticket.user?.name;
  if (customerEmail) {
    await sendTicketStatusEmail({
      to: customerEmail,
      customerName: customerName || "Customer",
      ticketCode: ticket.ticket_code,
      status: newStatus,
      shareToken: ticket.public_share_token,
    });
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
