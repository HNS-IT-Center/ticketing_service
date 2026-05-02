"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";

const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 8);

// ─── Ticket Point Calculator ───────────────────────────────────────────────
function getTicketPoints(type: string): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

// ─── Create Ticket ─────────────────────────────────────────────────────────
export async function createTicketAction(formData: FormData) {
  const session = await requireSession();

  const ticket_type = formData.get("ticket_type") as string;
  const device_type = formData.get("device_type") as string;
  const notes = formData.get("notes") as string | null;
  const technician_id = formData.get("technician_id") as string | null || null;
  const sales_id = formData.get("sales_id") as string | null || null;

  const ticket_code = `TKT-${nanoid()}`;

  // Workload check if technician assigned
  if (technician_id) {
    const workload = await db.technicianWorkload.findUnique({
      where: { technician_id },
    });
    if (workload) {
      const points = getTicketPoints(ticket_type);
      if (workload.current_points + points > workload.max_points) {
        return { error: "Selected technician has reached their workload limit" };
      }
    }
  }

  const ticket = await db.ticket.create({
    data: {
      ticket_code,
      user_id: session.userId,
      ticket_type: ticket_type as any,
      device_type: device_type as any,
      technician_id: technician_id || null,
      sales_id: sales_id || null,
      notes: notes || null,
      status: "waiting",
    },
  });

  // Create category-specific detail
  switch (ticket_type) {
    case "service":
      await db.ticketServiceDetail.create({ data: { ticket_id: ticket.id } });
      break;
    case "warranty_claim": {
      const purchaseDate = formData.get("purchase_date") as string;
      await db.ticketWarrantyDetail.create({
        data: { ticket_id: ticket.id, purchase_date: new Date(purchaseDate) },
      });
      break;
    }
    case "cleaning": {
      const pkg = formData.get("service_package") as string;
      await db.ticketCleaningDetail.create({
        data: { ticket_id: ticket.id, service_package: pkg as any },
      });
      break;
    }
    case "upgrade": {
      const upgradeIds = formData.getAll("upgrade_ids") as string[];
      await db.ticketUpgradeDetail.createMany({
        data: upgradeIds.map((id) => ({ ticket_id: ticket.id, upgrade_id: id })),
      });
      break;
    }
    case "pc_build": {
      await db.ticketPcBuildDetail.create({ data: { ticket_id: ticket.id } });
      const components = JSON.parse(formData.get("components") as string || "[]") as string[];
      if (components.length > 0) {
        await db.ticketPcBuildComponent.createMany({
          data: components.map((name) => ({ ticket_id: ticket.id, component_name: name })),
        });
      }
      break;
    }
  }

  // If technician assigned, update workload
  if (technician_id) {
    const points = getTicketPoints(ticket_type);
    await db.technicianWorkload.upsert({
      where: { technician_id },
      create: { technician_id, current_points: points, max_points: 7 },
      update: { current_points: { increment: points } },
    });
  }

  // Initial status log
  await db.ticketStatusLog.create({
    data: {
      ticket_id: ticket.id,
      old_status: null,
      new_status: "waiting",
      changed_by: session.userId,
    },
  });

  redirect(`/customer/tickets/${ticket.id}?success=1`);
}

// ─── Send Message ──────────────────────────────────────────────────────────
export async function sendMessageAction(ticketId: string, message: string) {
  const session = await requireSession();
  if (!message.trim()) return;

  const msg = await db.ticketMessage.create({
    data: { ticket_id: ticketId, sender_id: session.userId, message },
  });

  // Determine recipient
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { user_id: true, technician_id: true },
  });
  if (!ticket) return;

  const recipientId =
    session.userId === ticket.user_id
      ? ticket.technician_id
      : ticket.user_id;

  if (recipientId) {
    await db.notification.create({
      data: {
        user_id: recipientId,
        ticket_id: ticketId,
        type: "message",
        reference_id: msg.id,
      },
    });
  }

  revalidatePath(`/customer/tickets/${ticketId}`);
  revalidatePath(`/technician/tickets/${ticketId}`);
}

// ─── Mark Messages Read ────────────────────────────────────────────────────
export async function markMessagesReadAction(ticketId: string) {
  const session = await requireSession();

  await db.ticketMessage.updateMany({
    where: {
      ticket_id: ticketId,
      is_read: false,
      sender_id: { not: session.userId },
    },
    data: { is_read: true },
  });

  // Mark notifications read
  await db.notification.updateMany({
    where: {
      user_id: session.userId,
      ticket_id: ticketId,
      type: "message",
      is_read: false,
    },
    data: { is_read: true },
  });
}

// ─── Upload Attachments ────────────────────────────────────────────────────
export async function uploadAttachmentsAction(ticketId: string, files: File[]) {
  const supabase = createServerSupabaseClient();

  for (const file of files) {
    const ext = file.name.split(".").pop();
    const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type });

    if (error) continue;

    const { data: { publicUrl } } = supabase.storage
      .from("attachments")
      .getPublicUrl(data.path);

    let fileType: "image" | "video" | "pdf" = "pdf";
    if (file.type.startsWith("image/")) fileType = "image";
    if (file.type.startsWith("video/")) fileType = "video";

    await db.ticketAttachment.create({
      data: { ticket_id: ticketId, file_url: publicUrl, file_type: fileType },
    });
  }

  revalidatePath(`/customer/tickets/${ticketId}`);
}
