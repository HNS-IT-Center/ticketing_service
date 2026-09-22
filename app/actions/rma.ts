"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { uploadToR2, getExt, getFileType } from "@/lib/r2";
import {
  canActOnRma,
  releasesTicket,
  validateRmaTransition,
  type RmaTransitionInput,
} from "@/lib/rma/state-machine";
import type { RmaStatus, RmaDecision, UnitOwnership } from "@prisma/client";

// ─── RMA code generator ────────────────────────────────────────────────────
// RMA-{STORECODE}-{YYMM}-{0001}, sequence restarting each month per store.
async function generateRmaCode(storeCode: string | null): Promise<string> {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `RMA-${storeCode ?? "HNS"}-${yymm}-`;

  const last = await db.rmaCase.findFirst({
    where: { rma_code: { startsWith: prefix } },
    orderBy: { rma_code: "desc" },
    select: { rma_code: true },
  });

  const lastSeq = last ? parseInt(last.rma_code.slice(prefix.length), 10) : 0;
  const next = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── Handover: technician → RMA desk ───────────────────────────────────────
/**
 * Moves a warranty_claim ticket from `on_progress` into `rma_process` and opens
 * its RmaCase, recording the service form the technician filled in.
 *
 * Only the technician assigned to the ticket, or an Administrator, may do this.
 */
export async function handoverToRmaAction(formData: FormData) {
  try {
    const session = await requireSession();

    const ticketId = formData.get("ticketId") as string;
    const unitOwnership = formData.get("unit_ownership") as UnitOwnership | null;
    const stockOrigin = ((formData.get("stock_origin") as string | null) || "").trim();
    const snVerified = formData.get("sn_verified") === "1";
    const physicalCondition = ((formData.get("physical_condition") as string | null) || "").trim();
    const faultDescription = ((formData.get("fault_description") as string | null) || "").trim();
    const testResult = ((formData.get("test_result") as string | null) || "").trim();
    // URL of an invoice already attached at intake; only upload when absent.
    const existingInvoiceUrl = ((formData.get("purchase_invoice_url") as string | null) || "").trim();
    const invoiceFiles = (formData.getAll("invoice_files") as File[]).filter((f) => f.size > 0);

    if (!ticketId) return { error: "Ticket not found" };

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticket_code: true,
        ticket_type: true,
        status: true,
        technician_id: true,
        store_location: { select: { code: true } },
        rma_case: { select: { id: true } },
      },
    });

    if (!ticket) return { error: "Ticket not found" };

    // ── Authorization ──
    const isAdmin = session.role === "Administrator";
    const isAssignedTechnician =
      session.role === "Technician" && ticket.technician_id === session.userId;
    if (!isAdmin && !isAssignedTechnician) {
      return { error: "Only the assigned technician or an Administrator can hand a unit to RMA." };
    }

    // ── Preconditions ──
    if (ticket.ticket_type !== "warranty_claim") {
      return { error: "Only warranty claim tickets can be handed over to RMA." };
    }
    if (ticket.status !== "on_progress") {
      return { error: `Ticket must be in progress to hand over to RMA (currently "${ticket.status}").` };
    }
    if (ticket.rma_case) {
      return { error: "This ticket already has an RMA case." };
    }

    // ── Service form validation ──
    if (unitOwnership !== "customer" && unitOwnership !== "store_stock") {
      return { error: "Unit ownership is required." };
    }
    if (!snVerified) {
      return { error: "Serial number must be verified before handing the unit to RMA." };
    }
    if (!physicalCondition) return { error: "Physical condition is required." };
    if (!faultDescription) return { error: "Fault description is required." };
    if (!testResult) return { error: "Test result is required." };
    if (unitOwnership === "store_stock" && !stockOrigin) {
      return { error: "Stock origin is required for a store stock unit." };
    }
    if (unitOwnership === "customer" && !existingInvoiceUrl && invoiceFiles.length === 0) {
      return { error: "A purchase invoice is required for a customer-owned unit." };
    }

    // ── Upload the invoice only when intake did not already attach one ──
    let invoiceUrl: string | null = existingInvoiceUrl || null;
    if (!invoiceUrl && invoiceFiles.length > 0) {
      const file = invoiceFiles[0];
      const ext = getExt(file.type, file.name);
      const baseName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .toLowerCase()
        .slice(0, 40);
      const path = `tickets/${ticketId}/rma-invoice_${ticket.ticket_code}_${baseName}.${ext}`;
      try {
        invoiceUrl = await uploadToR2(file, path);
      } catch (err) {
        console.error("[RMA INVOICE UPLOAD ERROR]", err);
        return { error: "Failed to upload the invoice. Please check the file size and try again." };
      }
      // Keep it visible in the ticket's normal attachment list too.
      await db.ticketAttachment.create({
        data: { ticket_id: ticketId, file_url: invoiceUrl, file_type: getFileType(file.type) },
      });
    }

    const rmaCode = await generateRmaCode(ticket.store_location?.code ?? null);

    const created = await db.$transaction(async (tx) => {
      const rmaCase = await tx.rmaCase.create({
        data: {
          rma_code: rmaCode,
          ticket_id: ticketId,
          status: "pending_verification",
          unit_ownership: unitOwnership,
          stock_origin: unitOwnership === "store_stock" ? stockOrigin : null,
          purchase_invoice_url: invoiceUrl,
          sn_verified: snVerified,
          physical_condition: physicalCondition,
          fault_description: faultDescription,
          test_result: testResult,
          handed_over_by_id: session.userId,
        },
        select: { id: true, rma_code: true },
      });

      await tx.rmaEvent.create({
        data: {
          rma_case_id: rmaCase.id,
          from_status: null,
          to_status: "pending_verification",
          note: `Unit handed over to RMA (${rmaCode})`,
          actor_id: session.userId,
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: "rma_process", work_completed_at: new Date() },
      });

      await tx.ticketStatusLog.create({
        data: {
          ticket_id: ticketId,
          old_status: "on_progress",
          new_status: "rma_process",
          reason: `Handed over to RMA (${rmaCode})`,
          changed_by: session.userId,
        },
      });

      return rmaCase;
    });

    // Let the RMA desk know a case is waiting for verification.
    const rmaStaff = await db.user.findMany({
      where: { OR: [{ role: "RMA" }, { role: "Administrator" }] },
      select: { id: true },
    });
    if (rmaStaff.length > 0) {
      await db.notification.createMany({
        data: rmaStaff.map((u) => ({
          user_id: u.id,
          ticket_id: ticketId,
          type: "rma_update" as const,
          message: `📦 Klaim baru menunggu verifikasi — ${created.rma_code} (#${ticket.ticket_code})`,
        })),
      });
    }

    revalidatePath(`/technician/tickets/${ticketId}`);
    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath(`/sales/tickets/${ticketId}`);
    revalidatePath("/rma/dashboard");

    return { success: true, rmaCaseId: created.id, rmaCode: created.rma_code };
  } catch (err) {
    console.error("[HANDOVER TO RMA ERROR]", err);
    const message = err instanceof Error ? err.message : "An internal server error occurred";
    return { error: message };
  }
}

// ─── Transition an existing RMA case ───────────────────────────────────────
/**
 * The single entry point for every RMA state change. Rules live in
 * lib/rma/state-machine.ts; this function only enforces them against the DB.
 *
 * Concurrency: the update is guarded by the status the caller believed the case
 * was in, so two staff acting at once produce exactly one winner.
 */
export async function transitionRmaAction(formData: FormData) {
  try {
    const session = await requireSession();

    const rmaCaseId = formData.get("rmaCaseId") as string;
    const toStatus = formData.get("toStatus") as RmaStatus | null;

    if (!canActOnRma(session.role)) {
      return { error: "Hanya tim RMA dan Administrator yang dapat mengubah status klaim." };
    }
    if (!rmaCaseId || !toStatus) return { error: "RMA case not found" };

    const input: RmaTransitionInput = {
      hold_reason: ((formData.get("hold_reason") as string | null) || "").trim() || null,
      vendor_name: ((formData.get("vendor_name") as string | null) || "").trim() || null,
      vendor_rma_number: ((formData.get("vendor_rma_number") as string | null) || "").trim() || null,
      shipping_tracking: ((formData.get("shipping_tracking") as string | null) || "").trim() || null,
      decision: ((formData.get("decision") as string | null) || "").trim() as RmaDecision | null,
      decision_notes: ((formData.get("decision_notes") as string | null) || "").trim() || null,
      replacement_sn: ((formData.get("replacement_sn") as string | null) || "").trim() || null,
      note: ((formData.get("note") as string | null) || "").trim() || null,
    };

    const rmaCase = await db.rmaCase.findUnique({
      where: { id: rmaCaseId },
      select: {
        id: true,
        rma_code: true,
        status: true,
        ticket_id: true,
        ticket: {
          select: { id: true, ticket_code: true, status: true, technician_id: true },
        },
      },
    });

    if (!rmaCase) return { error: "RMA case not found" };

    const fromStatus = rmaCase.status;

    const check = validateRmaTransition({
      role: session.role,
      from: fromStatus,
      to: toStatus,
      input,
    });
    if (!check.ok) return { error: check.error };

    // ── Fields this transition writes onto the case ──
    const now = new Date();
    const data: Record<string, unknown> = { status: toStatus, handler_id: session.userId };

    if (toStatus === "on_hold") data.hold_reason = input.hold_reason;
    // Leaving on_hold clears the reason so a stale one cannot linger in the UI.
    if (fromStatus === "on_hold" && toStatus !== "on_hold") data.hold_reason = null;

    if (toStatus === "submitted_to_vendor") {
      data.vendor_name = input.vendor_name;
      data.vendor_rma_number = input.vendor_rma_number;
      data.shipping_tracking = input.shipping_tracking;
      data.submitted_at = now;
    }
    if (toStatus === "in_vendor_process" && input.shipping_tracking) {
      data.shipping_tracking = input.shipping_tracking;
    }
    if (toStatus === "vendor_decided") {
      data.decision = input.decision;
      data.decision_notes = input.decision_notes;
      data.replacement_sn = input.decision === "replaced" ? input.replacement_sn : null;
      data.decided_at = now;
    }
    if (toStatus === "unit_received") data.unit_received_at = now;
    if (toStatus === "closed") data.closed_at = now;
    if (toStatus === "cancelled") {
      data.hold_reason = input.hold_reason;
      data.closed_at = now;
    }

    // ── Optimistic lock: only apply if nobody changed the status meanwhile ──
    const updated = await db.rmaCase.updateMany({
      where: { id: rmaCaseId, status: fromStatus },
      data,
    });
    if (updated.count === 0) {
      return { error: "Status sudah diubah user lain. Muat ulang halaman untuk melihat kondisi terbaru." };
    }

    await db.rmaEvent.create({
      data: {
        rma_case_id: rmaCaseId,
        from_status: fromStatus,
        to_status: toStatus,
        note: input.note || input.hold_reason || input.decision_notes || null,
        actor_id: session.userId,
      },
    });

    // ── Closing or cancelling hands the ticket back to the normal workflow ──
    if (releasesTicket(toStatus) && rmaCase.ticket.status === "rma_process") {
      await db.$transaction([
        db.ticket.update({ where: { id: rmaCase.ticket_id }, data: { status: "done" } }),
        db.ticketStatusLog.create({
          data: {
            ticket_id: rmaCase.ticket_id,
            old_status: "rma_process",
            new_status: "done",
            reason:
              toStatus === "closed"
                ? `RMA case ${rmaCase.rma_code} closed`
                : `RMA case ${rmaCase.rma_code} cancelled`,
            changed_by: session.userId,
          },
        }),
      ]);
    }

    // ── Notify the technician who handled the ticket ──
    if (rmaCase.ticket.technician_id && rmaCase.ticket.technician_id !== session.userId) {
      await db.notification.create({
        data: {
          user_id: rmaCase.ticket.technician_id,
          ticket_id: rmaCase.ticket_id,
          type: "rma_update",
          message: `🔧 ${rmaCase.rma_code} (#${rmaCase.ticket.ticket_code}): ${fromStatus} → ${toStatus}`,
        },
      });
    }

    revalidatePath(`/rma/cases/${rmaCaseId}`);
    revalidatePath("/rma/dashboard");
    revalidatePath(`/technician/tickets/${rmaCase.ticket_id}`);
    revalidatePath(`/admin/tickets/${rmaCase.ticket_id}`);
    revalidatePath(`/sales/tickets/${rmaCase.ticket_id}`);

    return { success: true, status: toStatus };
  } catch (err) {
    console.error("[RMA TRANSITION ERROR]", err);
    const message = err instanceof Error ? err.message : "An internal server error occurred";
    return { error: message };
  }
}
