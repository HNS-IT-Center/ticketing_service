"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendTicketStatusEmail } from "@/lib/email";

const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 8);

// ─── Ticket Point Calculator ───────────────────────────────────────────────
function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

// ─── Create Ticket ─────────────────────────────────────────────────────────
export async function createTicketAction(formData: FormData) {
  const session = await requireSession();

  const ticket_type = formData.get("ticket_type") as string;
  const device_type = formData.get("device_type") as string;
  const notes = formData.get("notes") as string | null;
  const customer_type = (formData.get("customer_type") as string) || "User";
  const customer_name = formData.get("customer_name") as string | null;
  const customer_email = (formData.get("customer_email") as string | null) || null;
  const customer_address = formData.get("customer_address") as string | null;
  const customer_phone = formData.get("phone") as string;
  const technician_id = (formData.get("technician_id") as string | null) || null;
  const sales_id = (formData.get("sales_id") as string | null) || null;

  // New CS intake fields
  const store_location_id = (formData.get("store_location_id") as string | null) || null;
  const service_category = (formData.get("service_category") as string | null) || null;
  const accessories = (formData.get("accessories") as string | null) || null;
  const device_condition = (formData.get("device_condition") as string | null) || null;
  const is_overnight = formData.get("is_overnight") === "1";
  const is_overnight_check = formData.get("is_overnight_check") === "1";
  const checking_fee = is_overnight_check ? 50000 : null;
  const pickup_method = (formData.get("pickup_method") as string | null) || null;
  const terms_accepted = formData.get("terms_accepted") === "1";
  const technician_notes = (formData.get("technician_notes") as string | null) || null;

  // Generate ticket code — store-prefixed if store selected, else TKT-{nanoid}
  let ticket_code: string;
  if (store_location_id) {
    const store = await db.storeLocation.findUnique({
      where: { id: store_location_id },
      select: { code: true },
    });
    if (store) {
      const count = await db.ticket.count({ where: { store_location_id } });
      ticket_code = `${store.code}-${String(count + 1).padStart(6, "0")}`;
    } else {
      ticket_code = `TKT-${nanoid()}`;
    }
  } else {
    ticket_code = `TKT-${nanoid()}`;
  }

  // Auto-generate a secure public share token
  const public_share_token = randomBytes(24).toString("hex");
  const points = getTicketPoints(ticket_type, device_type);

  // Workload check removed in Phase 3

  // Build the category-specific detail create operations for the transaction
  const ticket = await db.ticket.create({
    data: {
      ticket_code,
      user_id: session.userId,
      ticket_type: ticket_type as any,
      device_type: device_type as any,
      is_for_self: false,
      customer_type: customer_type as any,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      technician_id: technician_id || null,
      sales_id: sales_id || null,
      notes: notes || null,
      status: "waiting",
      // New fields
      store_location_id,
      service_category: service_category as any,
      accessories,
      device_condition,
      is_overnight,
      is_overnight_check,
      checking_fee,
      pickup_method: pickup_method as any,
      terms_accepted,
      technician_notes,
      public_share_token,
    },
    select: { id: true },
  });

  // Build all follow-up writes and run them in parallel
  const followUps: Promise<unknown>[] = [];

  // Handle attachments
  const ticketFiles = formData.getAll("ticket_files") as File[];
  const progressFiles = formData.getAll("progress_files") as File[];
  const files = [...ticketFiles, ...progressFiles];
  let firstUploadedUrl: string | null = null;
  if (files.length > 0) {
    const supabase = createServerSupabaseClient();
    const uploadOps = files.map(async (file) => {
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
      const path = `${ticket.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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
        data: { ticket_id: ticket.id, file_url: publicUrl, file_type: fileType },
      });
      return publicUrl;
    });
    
    // We await the uploads to get the first file URL for PC builds
    const uploadedUrls = await Promise.all(uploadOps);
    firstUploadedUrl = uploadedUrls.find(url => url != null) || null;
  }

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
        db.ticketPcBuildDetail.create({ data: { ticket_id: ticket.id, first_build_url: firstUploadedUrl } }),
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

  // Workload update removed: workload is tracked dynamically.

  // Run all follow-up writes in parallel
  await Promise.all(followUps);

  // ── Fire creation email to customer (non-blocking) ────────────────────────
  if (customer_email) {
    sendTicketStatusEmail({
      to: customer_email,
      customerName: customer_name || "Customer",
      ticketCode: ticket_code,
      status: "waiting",
      shareToken: public_share_token,
    }).catch((err) => console.error("[EMAIL CREATE ERROR]", err));
  }

  if (session.role === "Administrator" || session.role === "Sales") {
    redirect(`/admin/tickets`);
  } else {
    redirect(`/technician/tickets`);
  }
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

// ─── Send Public (Anonymous) Message ───────────────────────────────────────
export async function sendPublicMessageAction(
  ticketId: string,
  shareToken: string,
  message: string,
  senderName: string
) {
  // Verify the share token matches to prevent abuse
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { public_share_token: true, public_chat_enabled: true },
  });

  if (!ticket || ticket.public_share_token !== shareToken) {
    return { error: "Invalid ticket or share token" };
  }
  if (!ticket.public_chat_enabled) {
    return { error: "Chat is disabled for this ticket" };
  }

  await db.ticketMessage.create({
    data: {
      ticket_id: ticketId,
      sender_id: null,        // anonymous
      sender_name: senderName,
      message,
      is_read: false,
    },
  });

  revalidatePath(`/ticket/${shareToken}`);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

// ─── Update Pickup Method ──────────────────────────────────────────────────
export async function updatePickupMethodAction(ticketId: string, pickupMethod: "self_pickup" | "courier") {
  const session = await requireSession();
  if (session.role !== "Administrator" && session.role !== "Technician" && session.role !== "Sales") {
    return { error: "Unauthorized" };
  }

  // Server-side guard: courier is only allowed for pc_build tickets
  if (pickupMethod === "courier") {
    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { ticket_type: true },
    });
    if (!ticket) return { error: "Ticket not found" };
    if (ticket.ticket_type !== "pc_build") {
      return { error: "Courier delivery is only available for PC Build tickets." };
    }
  }

  await db.ticket.update({
    where: { id: ticketId },
    data: { pickup_method: pickupMethod },
  });

  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath(`/technician/tickets/${ticketId}`);
  return { success: true };
}

// ─── Toggle Extra Service (Bonus Points) ──────────────────────────────────
// Only the assigned technician can toggle extra services.
// Each extra service adds +3 points to the ticket's effective point value.
export async function toggleExtraServiceAction(ticketId: string, serviceName: string, isAdding: boolean) {
  const session = await requireSession();
  if (session.role !== "Technician" && session.role !== "Administrator") {
    return { error: "Unauthorized" };
  }

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { technician_id: true, extra_services: true },
  });

  if (!ticket) return { error: "Ticket not found" };
  // Only assigned technician or admin can modify
  if (session.role === "Technician" && ticket.technician_id !== session.userId) {
    return { error: "You are not assigned to this ticket" };
  }

  const current = ticket.extra_services as string[];
  const updated = isAdding
    ? [...new Set([...current, serviceName])]
    : current.filter((s) => s !== serviceName);

  await db.ticket.update({
    where: { id: ticketId },
    data: { extra_services: updated },
  });

  revalidatePath(`/technician/tickets/${ticketId}`);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true, extra_services: updated };
}
