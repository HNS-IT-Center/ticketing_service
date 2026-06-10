"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

/** Sanitize a filename: strip extension, replace unsafe chars with dash */
function sanitizeName(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, "");
  return withoutExt.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase().slice(0, 40);
}

// ─── Upload First Build Layout ─────────────────────────────────────────────
// Called from PcBuildHandover when technician/admin uploads the initial build photo.
export async function uploadFirstBuildAction(formData: FormData) {
  const session = await requireRole("Sales", "Administrator", "Technician");
  const ticketId = formData.get("ticketId") as string;
  const file = formData.get("file") as File;

  if (!ticketId) return { error: "Ticket ID is required" };
  if (!file || file.size === 0) return { error: "No file was uploaded" };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, ticket_code: true, ticket_type: true,
      status: true, technician_id: true, sales_id: true,
      pc_build_detail: true,
    },
  });
  if (!ticket) return { error: "Ticket not found" };
  if (ticket.ticket_type !== "pc_build") return { error: "This action is only for PC build tickets" };

  if (session.role === "Sales" && ticket.sales_id !== session.userId)
    return { error: "Unauthorized. You are not assigned to this ticket" };
  if (session.role === "Technician" && ticket.technician_id !== session.userId)
    return { error: "Unauthorized. You are not assigned to this ticket" };

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();

    const ext = file.name.split(".").pop() ?? "jpg";
    const baseName = sanitizeName(file.name);
    // e.g. first-build_HNS-NGW-001_layout.jpg
    const fileName = `first-build_${ticket.ticket_code}_${baseName}.${ext}`;
    const path = `${ticketId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type, upsert: true });

    if (error) return { error: `Upload failed: ${error.message}` };

    const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(data.path);

    let fileType: "image" | "video" | "pdf" = "pdf";
    if (file.type.startsWith("image/")) fileType = "image";
    if (file.type.startsWith("video/")) fileType = "video";

    await Promise.all([
      // Keep in attachments for history
      db.ticketAttachment.create({
        data: { ticket_id: ticketId, file_url: publicUrl, file_type: fileType },
      }),
      // Set as first_build_url (latest upload wins — older ones stay in attachments history)
      db.ticketPcBuildDetail.upsert({
        where: { ticket_id: ticketId },
        create: { ticket_id: ticketId, first_build_url: publicUrl },
        update: { first_build_url: publicUrl },
      }),
      db.ticketStatusLog.create({
        data: {
          ticket_id: ticketId,
          old_status: ticket.status,
          new_status: ticket.status,
          reason: "Uploaded PC Build First Build Layout",
          changed_by: session.userId,
        },
      }),
    ]);

    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath(`/technician/tickets/${ticketId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Unexpected error during upload" };
  }
}

// ─── Upload Revision Build ─────────────────────────────────────────────────
export async function uploadRevisionBuildAction(formData: FormData) {
  const session = await requireRole("Sales", "Administrator", "Technician");
  const ticketId = formData.get("ticketId") as string;
  const file = formData.get("file") as File;

  if (!ticketId) return { error: "Ticket ID is required" };
  if (!file || file.size === 0) return { error: "No file was uploaded" };

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, ticket_code: true, ticket_type: true,
      status: true, technician_id: true, sales_id: true,
      pc_build_detail: true,
    },
  });
  if (!ticket) return { error: "Ticket not found" };

  if (session.role === "Sales" && ticket.sales_id !== session.userId)
    return { error: "Unauthorized. You are not assigned to this ticket" };
  if (session.role === "Technician" && ticket.technician_id !== session.userId)
    return { error: "Unauthorized. You are not assigned to this ticket" };

  // Status check: Sales/Admin must wait until technician marks done
  if (session.role !== "Technician" && (ticket.status === "waiting" || ticket.status === "on_progress")) {
    return { error: "Cannot upload revision before the technician marks the build as done" };
  }

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();

    // Count existing revisions so we can increment the number
    const existingRevisionCount = await db.ticketStatusLog.count({
      where: {
        ticket_id: ticketId,
        reason: { startsWith: "Uploaded PC Build Revision" },
      },
    });
    const revisionNumber = existingRevisionCount + 1;

    const ext = file.name.split(".").pop() ?? "jpg";
    const baseName = sanitizeName(file.name);
    // e.g. revision-2_HNS-NGW-001_updated-layout.jpg
    const fileName = `revision-${revisionNumber}_${ticket.ticket_code}_${baseName}.${ext}`;
    const path = `${ticketId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type });

    if (error) return { error: `Upload failed: ${error.message}` };

    const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(data.path);

    let fileType: "image" | "video" | "pdf" = "pdf";
    if (file.type.startsWith("image/")) fileType = "image";
    if (file.type.startsWith("video/")) fileType = "video";

    await Promise.all([
      // Keep in attachments for full revision history
      db.ticketAttachment.create({
        data: { ticket_id: ticketId, file_url: publicUrl, file_type: fileType },
      }),
      // Update revision_build_url to latest (all versions are in attachments history)
      db.ticketPcBuildDetail.upsert({
        where: { ticket_id: ticketId },
        create: { ticket_id: ticketId, revision_build_url: publicUrl },
        update: { revision_build_url: publicUrl },
      }),
      db.ticketStatusLog.create({
        data: {
          ticket_id: ticketId,
          old_status: ticket.status,
          new_status: ticket.status,
          reason: `Uploaded PC Build Revision #${revisionNumber}`,
          changed_by: session.userId,
        },
      }),
    ]);

    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath(`/technician/tickets/${ticketId}`);
    return { success: true, revisionNumber };
  } catch (err: any) {
    return { error: err.message || "Unexpected error during upload" };
  }
}
