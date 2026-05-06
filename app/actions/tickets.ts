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
  const is_for_self = formData.get("is_for_self") === "1";
  const customer_name = formData.get("customer_name") as string | null;
  const technician_id = (formData.get("technician_id") as string | null) || null;
  const sales_id = (formData.get("sales_id") as string | null) || null;

  const ticket_code = `TKT-${nanoid()}`;
  const points = getTicketPoints(ticket_type);

  // Workload check if technician assigned (must be done before ticket creation)
  if (technician_id) {
    const workload = await db.technicianWorkload.findUnique({
      where: { technician_id },
      select: { current_points: true, max_points: true },
    });
    if (workload && workload.current_points + points > workload.max_points) {
      return { error: "Selected technician has reached their workload limit" };
    }
  }

  // Build the category-specific detail create operations for the transaction
  const ticket = await db.ticket.create({
    data: {
      ticket_code,
      user_id: session.userId,
      ticket_type: ticket_type as any,
      device_type: device_type as any,
      is_for_self,
      customer_name: is_for_self ? null : customer_name,
      technician_id: technician_id || null,
      sales_id: sales_id || null,
      notes: notes || null,
      status: "waiting",
    },
    select: { id: true },
  });

  // Build all follow-up writes and run them in parallel
  const followUps: Promise<unknown>[] = [];

  // Status log
  followUps.push(
    db.ticketStatusLog.create({
      data: {
        ticket_id: ticket.id,
        old_status: null,
        new_status: "waiting",
        changed_by: session.userId,
      },
    })
  );

  // Category-specific detail
  switch (ticket_type) {
    case "service":
      followUps.push(db.ticketServiceDetail.create({ data: { ticket_id: ticket.id } }));
      break;
    case "warranty_claim": {
      const purchaseDate = formData.get("purchase_date") as string;
      followUps.push(
        db.ticketWarrantyDetail.create({
          data: { ticket_id: ticket.id, purchase_date: new Date(purchaseDate) },
        })
      );
      break;
    }
    case "cleaning": {
      const pkg = formData.get("service_package") as string;
      followUps.push(
        db.ticketCleaningDetail.create({
          data: { ticket_id: ticket.id, service_package: pkg as any },
        })
      );
      break;
    }
    case "upgrade": {
      const upgradeIds = formData.getAll("upgrade_ids") as string[];
      if (upgradeIds.length > 0) {
        followUps.push(
          db.ticketUpgradeDetail.createMany({
            data: upgradeIds.map((id) => ({ ticket_id: ticket.id, upgrade_id: id })),
          })
        );
      }
      break;
    }
    case "pc_build": {
      const components = JSON.parse((formData.get("components") as string) || "[]") as string[];
      const pcOps: Promise<unknown>[] = [
        db.ticketPcBuildDetail.create({ data: { ticket_id: ticket.id } }),
      ];
      if (components.length > 0) {
        pcOps.push(
          db.ticketPcBuildComponent.createMany({
            data: components.map((name) => ({ ticket_id: ticket.id, component_name: name })),
          })
        );
      }
      followUps.push(Promise.all(pcOps));
      break;
    }
  }

  // Workload update (if technician assigned)
  if (technician_id) {
    followUps.push(
      db.technicianWorkload.upsert({
        where: { technician_id },
        create: { technician_id, current_points: points, max_points: 7 },
        update: { current_points: { increment: points } },
      })
    );
  }

  // Run all follow-up writes in parallel
  await Promise.all(followUps);

  redirect(`/customer/tickets/${ticket.id}?success=1`);
}

// ─── Send Message ──────────────────────────────────────────────────────────
export async function sendMessageAction(ticketId: string, message: string) {
  const session = await requireSession();
  if (!message.trim()) return;

  // Create message + fetch ticket info in parallel
  const [msg, ticket] = await Promise.all([
    db.ticketMessage.create({
      data: { ticket_id: ticketId, sender_id: session.userId, message },
      select: { id: true },
    }),
    db.ticket.findUnique({
      where: { id: ticketId },
      select: { user_id: true, technician_id: true },
    }),
  ]);

  if (!ticket) return;

  const recipientId =
    session.userId === ticket.user_id ? ticket.technician_id : ticket.user_id;

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

  // Run both updateMany in parallel
  await Promise.all([
    db.ticketMessage.updateMany({
      where: {
        ticket_id: ticketId,
        is_read: false,
        sender_id: { not: session.userId },
      },
      data: { is_read: true },
    }),
    db.notification.updateMany({
      where: {
        user_id: session.userId,
        ticket_id: ticketId,
        type: "message",
        is_read: false,
      },
      data: { is_read: true },
    }),
  ]);
}

// ─── Upload Attachments ────────────────────────────────────────────────────
export async function uploadAttachmentsAction(ticketId: string, files: File[]) {
  const supabase = createServerSupabaseClient();

  // Upload all files in parallel (instead of sequential loop)
  await Promise.all(
    files.map(async (file) => {
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
    })
  );

  revalidatePath(`/customer/tickets/${ticketId}`);
}
