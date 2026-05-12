"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
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

  // If technician, create workload record
  if (data.role === "Technician") {
    await db.technicianWorkload.create({
      data: { technician_id: user.id, current_points: 0, max_points: 7 },
    });
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

  if (max_points) {
    await db.technicianWorkload.upsert({
      where: { technician_id: userId },
      create: {
        technician_id: userId,
        current_points: 0,
        max_points: parseInt(max_points),
      },
      update: { max_points: parseInt(max_points) },
    });
  }

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
  await requireRole("Administrator");

  await db.ticket.update({
    where: { id: ticketId },
    data: {
      technician_id: technicianId || null,
      sales_id: salesId || null,
    },
  });

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
    include: { user: { select: { name: true, email: true } } },
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
    const points = ticket.ticket_type === "pc_build" ? 4 : ticket.ticket_type === "service" ? 3 : 2;
    await db.technicianPerformance.update({
      where: { technician_id: ticket.technician_id },
      data: {
        tickets_handled: { increment: 1 },
        success_count: newStatus === "done" || newStatus === "completed" ? { increment: 1 } : undefined,
        failed_count: newStatus !== "done" && newStatus !== "completed" ? { increment: 1 } : undefined,
        total_points_completed: (newStatus === "done" || newStatus === "completed") ? { increment: points } : undefined,
      },
    });
    await db.technicianWorkload.update({
      where: { technician_id: ticket.technician_id },
      data: { current_points: { decrement: points } },
    });
  }

  // Notify customer
  await db.notification.create({
    data: {
      user_id: ticket.user_id,
      ticket_id: ticketId,
      type: "status_update",
    },
  });

  // Send email to customer if they have an email address
  const customerEmail = ticket.customer_email || ticket.user.email;
  const customerName = ticket.customer_name || ticket.user.name;
  if (customerEmail) {
    await sendTicketStatusEmail({
      to: customerEmail,
      customerName,
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
