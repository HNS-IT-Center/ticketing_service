"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export async function uploadRevisionBuildAction(formData: FormData) {
  const session = await requireRole("Sales", "Administrator");
  const ticketId = formData.get("ticketId") as string;
  const file = formData.get("file") as File;

  if (!ticketId) {
    return { error: "Ticket ID is required" };
  }

  if (!file || file.size === 0) {
    return { error: "No file was uploaded" };
  }

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { pc_build_detail: true },
  });

  if (!ticket) {
    return { error: "Ticket not found" };
  }

  // Authorization check: Sales can only modify their assigned tickets
  if (session.role === "Sales" && ticket.sales_id !== session.userId) {
    return { error: "Unauthorized. You are not assigned to this ticket" };
  }

  // Status check: Technician must have finished the build
  if (ticket.status === "waiting" || ticket.status === "on_progress") {
    return { error: "Cannot upload revision before the technician marks the build as done" };
  }

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();
    
    const ext = file.name.split(".").pop();
    const path = `${ticketId}/revision-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type });

    if (error) {
      return { error: `Failed to upload file: ${error.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("attachments").getPublicUrl(data.path);

    let fileType: "image" | "video" | "pdf" = "pdf";
    if (file.type.startsWith("image/")) fileType = "image";
    if (file.type.startsWith("video/")) fileType = "video";

    // 1. Create a general ticket attachment so it's in the list
    await db.ticketAttachment.create({
      data: {
        ticket_id: ticketId,
        file_url: publicUrl,
        file_type: fileType,
      },
    });

    // 2. Update revision_build_url in TicketPcBuildDetail
    await db.ticketPcBuildDetail.upsert({
      where: { ticket_id: ticketId },
      create: {
        ticket_id: ticketId,
        revision_build_url: publicUrl,
      },
      update: {
        revision_build_url: publicUrl,
      },
    });

    // 3. Log this status update or chat action (optional, but good practice)
    await db.ticketStatusLog.create({
      data: {
        ticket_id: ticketId,
        old_status: ticket.status,
        new_status: ticket.status,
        reason: "Uploaded PC Build Revision Image",
        changed_by: session.userId,
      },
    });

    revalidatePath(`/admin/tickets/${ticketId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "An unexpected error occurred during upload" };
  }
}
