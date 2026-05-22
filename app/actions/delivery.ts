"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { adminUpdateTicketStatusAction } from "./admin";

export async function uploadDeliveryProofAction(formData: FormData) {
  const session = await requireRole("Sales", "Administrator");
  const ticketId = formData.get("ticketId") as string;
  const status = formData.get("status") as "handed_to_courier" | "completed";
  const file = formData.get("file") as File;
  const proofType = formData.get("proofType") as "payment" | "progress";

  if (!ticketId || !status || !file) {
    return { error: "Missing required fields" };
  }

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) return { error: "Ticket not found" };

  if (session.role === "Sales" && ticket.sales_id !== session.userId) {
    return { error: "Unauthorized. You are not assigned to this ticket" };
  }

  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();
    
    const ext = file.name.split(".").pop();
    const path = `${ticketId}/${proofType}_proof-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type });

    if (error) {
      return { error: `Failed to upload file: ${error.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("attachments").getPublicUrl(data.path);

    // Update ticket URL fields
    if (proofType === "payment") {
      await db.ticket.update({
        where: { id: ticketId },
        data: { payment_proof_url: publicUrl },
      });
    } else if (proofType === "progress") {
      await db.ticket.update({
        where: { id: ticketId },
        data: { progress_proof_url: publicUrl },
      });
    }

    // Now update status
    await adminUpdateTicketStatusAction(ticketId, status);

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "An unexpected error occurred during upload" };
  }
}
