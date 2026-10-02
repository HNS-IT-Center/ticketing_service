"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { uploadToR2, getExt, getFileType } from "@/lib/r2";
import { getTicketPoints } from "@/lib/points";
import { canonicalVendorName, cleanVendorName } from "@/lib/rma/vendor";
import {
  canActOnRma,
  releasesTicket,
  validateRmaTransition,
  type RmaTransitionInput,
} from "@/lib/rma/state-machine";
import type { RmaStatus, RmaDecision, UnitOwnership } from "@prisma/client";

// ─── RMA code generator ────────────────────────────────────────────────────
// RMA-{STORECODE}-{YYMM}-{0001}, sequence restarting each month per store.

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Matches the FileUpload limit used at intake. */
const MAX_DAMAGE_PHOTOS = 5;

function rmaCodePrefix(storeCode: string | null): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `RMA-${storeCode ?? "HNS"}-${yymm}-`;
}

/**
 * Allocates the next code INSIDE a transaction.
 *
 * Reading the highest existing code is a lost-update race: two handovers at one
 * store in the same instant both read the same maximum and then fight over the
 * same number. Under PostgreSQL that was serialised by
 * `pg_advisory_xact_lock`, which has no MariaDB equivalent that behaves the
 * same way — `GET_LOCK()` is scoped to the connection rather than the
 * transaction, so it would need its own release path and its own tests.
 *
 * Dropped rather than translated, because the correctness of the result never
 * rested on it: the unique index on `rma_code` rejects a duplicate, and the
 * caller retries up to three times on exactly that violation. Without the lock
 * the retry fires more often; the code it finally allocates is the same one.
 *
 * If contention ever proves common — two staff at one store handing over within
 * milliseconds, repeatedly — GET_LOCK() can be added here without changing
 * anything around it.
 */
async function allocateRmaCode(tx: TxClient, prefix: string): Promise<string> {
  const last = await tx.rmaCase.findFirst({
    where: { rma_code: { startsWith: prefix } },
    orderBy: { rma_code: "desc" },
    select: { rma_code: true },
  });

  const lastSeq = last ? parseInt(last.rma_code.slice(prefix.length), 10) : 0;
  const next = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * True when the error is a unique-constraint violation on rma_code specifically.
 *
 * Prisma reports the offending key differently depending on version and driver
 * — `meta.target` as a field array, `meta.constraint` as the index name, or only
 * in the message — so all three are inspected. A collision on ticket_id (a
 * second handover for the same ticket) must NOT match here: it is a real error
 * and retrying it would loop.
 */
function isRmaCodeCollision(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string; meta?: Record<string, unknown> };

  const isUniqueViolation =
    e.code === "P2002" || (e.message ?? "").includes("Unique constraint failed");
  if (!isUniqueViolation) return false;

  const haystack = `${JSON.stringify(e.meta ?? {})} ${e.message ?? ""}`;
  return haystack.includes("rma_code");
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
    // Photographic evidence of the fault, separate from the invoice. The RMA
    // desk decides eligibility now, and it cannot do that on three lines of
    // typed description.
    const damageFiles = (formData.getAll("damage_files") as File[]).filter((f) => f.size > 0);
    const recommendedEligibleRaw = (formData.get("recommended_eligible") as string | null) || "";
    const recommendationNote =
      ((formData.get("recommendation_note") as string | null) || "").trim() || null;

    if (!ticketId) return { error: "Ticket not found" };

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticket_code: true,
        ticket_type: true,
        device_type: true,
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

    if (damageFiles.length === 0) {
      return {
        error: "Minimal satu foto atau video kondisi/kerusakan unit wajib dilampirkan.",
      };
    }
    if (damageFiles.length > MAX_DAMAGE_PHOTOS) {
      return { error: `Maksimal ${MAX_DAMAGE_PHOTOS} berkas bukti kerusakan.` };
    }
    // Images AND video. This was images-only, on the reasoning that a video is
    // heavier and a scratch is harder to judge from one. Practice disagreed:
    // the desk kept holding cases for a video the technician had no way to
    // attach — "VIDEO KERUSAKAN BELUM DIKIRIMKAN" as a hold reason on a live
    // case. An intermittent fault is the normal reason a unit is claimed, and
    // it is exactly what a still cannot show.
    //
    // `FileType` already has `video`, and `components/ui/FilePreview.tsx`
    // already renders one, so the case page plays it without further change.
    // The ceiling is `serverActions.bodySizeLimit` in next.config.ts (20 MB for
    // the whole submission, not per file).
    const badFile = damageFiles.find(
      (f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"),
    );
    if (badFile) {
      return {
        error: `Bukti kerusakan harus berupa gambar atau video. "${badFile.name}" bukan keduanya.`,
      };
    }

    if (recommendedEligibleRaw !== "yes" && recommendedEligibleRaw !== "no") {
      return { error: "Rekomendasi teknisi (layak / tidak layak) wajib dipilih." };
    }
    const recommendedEligible = recommendedEligibleRaw === "yes";

    // Optional when the technician thinks it qualifies — "looks covered" needs
    // no essay. Required when they think it does not: the desk is being told to
    // consider turning a customer down, and it should be told why.
    if (!recommendedEligible && !recommendationNote) {
      return {
        error: "Catatan wajib diisi bila rekomendasi teknisi adalah tidak layak.",
      };
    }
    if (unitOwnership === "store_stock" && !stockOrigin) {
      return { error: "Stock origin is required for a store stock unit." };
    }
    if (unitOwnership === "customer" && !existingInvoiceUrl && invoiceFiles.length === 0) {
      return { error: "A purchase invoice is required for a customer-owned unit." };
    }

    // ── The chosen invoice must be an attachment of THIS ticket ──
    // The URL arrives from the client, so it is never trusted on its own: an
    // arbitrary URL, or one belonging to another ticket, is rejected.
    if (existingInvoiceUrl) {
      const owned = await db.ticketAttachment.findFirst({
        where: { ticket_id: ticketId, file_url: existingInvoiceUrl },
        select: { id: true },
      });
      if (!owned) {
        return { error: "The selected invoice is not an attachment of this ticket." };
      }
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

    // ── Upload the damage photos ──
    // Before the case row exists, so a failed upload leaves nothing behind: the
    // handover simply has not happened yet.
    const damageUrls: { url: string; type: ReturnType<typeof getFileType> }[] = [];
    for (const [i, file] of damageFiles.entries()) {
      const ext = getExt(file.type, file.name);
      const path = `tickets/${ticketId}/rma-damage_${ticket.ticket_code}_${i + 1}.${ext}`;
      try {
        damageUrls.push({ url: await uploadToR2(file, path), type: getFileType(file.type) });
      } catch (err) {
        console.error("[RMA DAMAGE PHOTO UPLOAD ERROR]", err);
        return {
          error: "Gagal mengunggah foto kerusakan. Periksa ukuran file lalu coba lagi.",
        };
      }
    }

    // Staff at the same store can hand over at the same instant and compute the
    // same next sequence, so a unique-violation on rma_code is retried with a
    // freshly generated code rather than surfaced to the technician.
    const rmaStaff = await db.user.findMany({
      where: { is_active: true, OR: [{ role: "RMA" }, { role: "Administrator" }] },
      select: { id: true },
    });

    let created: { id: string; rma_code: string } | null = null;
    let lastError: unknown = null;

    const codePrefix = rmaCodePrefix(ticket.store_location?.code ?? null);
    const claimPoints = getTicketPoints(ticket.ticket_type, ticket.device_type);

    // The budget is the concurrency this can absorb, not a round number.
    //
    // Each round, exactly one racer commits and the rest lose the unique index
    // on rma_code, so with N simultaneous handovers at one store the last one
    // needs its Nth attempt. Under PostgreSQL an advisory lock serialised them
    // and the retry was pure safety net; MariaDB has no transaction-scoped
    // equivalent, so the retry now carries the contention itself. At 3 — the
    // value inherited from the locked version — four parallel handovers made
    // the fourth fail, which is how the test caught it.
    //
    // Exhausting the budget is safe, only unhelpful: the unique index is what
    // guarantees codes never collide, so the caller gets "please try again"
    // rather than a duplicate. Ten is far above anything one store will ever do
    // in the same instant.
    //
    // The deterministic fix is a per-prefix counter row, whose InnoDB lock is
    // held to commit and released on rollback. That is a schema change and is
    // deliberately not bundled into the port — see BL19.
    const MAX_ALLOCATION_ATTEMPTS = 10;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS && created === null; attempt++) {
      try {
        created = await db.$transaction(async (tx) => {
          const rmaCode = await allocateRmaCode(tx, codePrefix);

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
              recommended_eligible: recommendedEligible,
              recommendation_note: recommendationNote,
            },
            select: { id: true, rma_code: true },
          });

          // Inside the transaction: a rolled-back handover leaves no orphaned
          // attachment rows pointing at the uploaded files.
          if (damageUrls.length > 0) {
            await tx.ticketAttachment.createMany({
              data: damageUrls.map((d) => ({
                ticket_id: ticketId,
                file_url: d.url,
                file_type: d.type,
              })),
            });
          }

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

          // The technician's work on a claim finishes here, so this is where
          // the claim is credited. The `done` written when the case closes --
          // possibly months later, by the RMA desk -- credits nothing; see
          // lib/kpi.ts. Inside the transaction, so a retried handover cannot
          // credit twice.
          if (ticket.technician_id) {
            await tx.technicianPerformance.upsert({
              where: { technician_id: ticket.technician_id },
              create: {
                technician_id: ticket.technician_id,
                tickets_handled: 1,
                success_count: 1,
                failed_count: 0,
                total_points_completed: claimPoints,
              },
              update: {
                tickets_handled: { increment: 1 },
                success_count: { increment: 1 },
                total_points_completed: { increment: claimPoints },
              },
            });
          }

          // Inside the transaction: if the handover rolls back, so do the alerts.
          if (rmaStaff.length > 0) {
            await tx.notification.createMany({
              data: rmaStaff.map((u) => ({
                user_id: u.id,
                ticket_id: ticketId,
                type: "rma_update" as const,
                message: `📦 Klaim baru menunggu verifikasi — ${rmaCode} (#${ticket.ticket_code})`,
              })),
            });
          }

          return rmaCase;
        });
      } catch (err) {
        if (isRmaCodeCollision(err)) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (created === null) {
      console.error("[RMA CODE COLLISION] exhausted retries", lastError);
      return { error: "Failed to allocate an RMA number. Please try again." };
    }

    revalidatePath(`/technician/tickets/${ticketId}`);
    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath(`/sales/tickets/${ticketId}`);
    revalidatePath("/rma/dashboard");

    // The handover is what puts the claim on the leaderboard, so the cached
    // scores are stale from this moment.
    revalidateTag("leaderboard-techs", "max");
    revalidateTag("leaderboard-stores", "max");
    revalidateTag("tech-month-winner", "max");
    if (ticket.technician_id) {
      revalidateTag(`user-profile:${ticket.technician_id}`, "max");
    }

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

    // Fold a newly typed vendor onto one already in use when they differ only
    // by case or spacing, so per-vendor figures do not split. See lib/rma/vendor.ts.
    const typedVendor = (formData.get("vendor_name") as string | null) || "";
    let vendorName: string | null = null;
    if (cleanVendorName(typedVendor)) {
      const known = await db.rmaCase.findMany({
        where: { vendor_name: { not: null } },
        distinct: ["vendor_name"],
        select: { vendor_name: true },
      });
      vendorName =
        canonicalVendorName(
          typedVendor,
          known.map((k) => k.vendor_name!).filter(Boolean)
        ) || null;
    }

    const input: RmaTransitionInput = {
      hold_reason: ((formData.get("hold_reason") as string | null) || "").trim() || null,
      ineligibility_reason:
        ((formData.get("ineligibility_reason") as string | null) || "").trim() || null,
      stock_transfer_number:
        ((formData.get("stock_transfer_number") as string | null) || "").trim() || null,
      customer_ticket_number:
        ((formData.get("customer_ticket_number") as string | null) || "").trim() || null,
      vendor_name: vendorName,
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
        unit_ownership: true,
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
      unitOwnership: rmaCase.unit_ownership,
    });
    if (!check.ok) return { error: check.error };

    // Turning a claim down is the one desk decision the customer sees, so it
    // carries the same evidence burden the technician now carries at handover.
    const ineligibleFiles = (formData.getAll("damage_files") as File[]).filter(
      (f) => f.size > 0
    );
    if (toStatus === "ineligible") {
      if (ineligibleFiles.length === 0) {
        return { error: "Minimal satu foto bukti wajib dilampirkan saat menolak klaim." };
      }
      if (ineligibleFiles.length > MAX_DAMAGE_PHOTOS) {
        return { error: `Maksimal ${MAX_DAMAGE_PHOTOS} foto.` };
      }
      const bad = ineligibleFiles.find((f) => !f.type.startsWith("image/"));
      if (bad) return { error: `Foto harus berupa gambar. "${bad.name}" bukan gambar.` };
    }

    // Proof of handover for a customer's own unit. Optional by decision — the
    // receipt is not always in hand when the unit is sent — but when photos are
    // supplied they carry the same burden as every other evidence upload here.
    const receiptFiles = (formData.getAll("receipt_files") as File[]).filter(
      (f) => f.size > 0
    );
    if (receiptFiles.length > 0) {
      if (toStatus !== "submitted_to_vendor") {
        return { error: "Foto tanda terima hanya dilampirkan saat mengajukan ke vendor." };
      }
      if (receiptFiles.length > MAX_DAMAGE_PHOTOS) {
        return { error: `Maksimal ${MAX_DAMAGE_PHOTOS} foto tanda terima.` };
      }
      const badReceipt = receiptFiles.find((f) => !f.type.startsWith("image/"));
      if (badReceipt) {
        return { error: `Foto harus berupa gambar. "${badReceipt.name}" bukan gambar.` };
      }
    }

    // ── Fields this transition writes onto the case ──
    const now = new Date();
    const data: Record<string, unknown> = { status: toStatus, handler_id: session.userId };

    if (toStatus === "on_hold") data.hold_reason = input.hold_reason;
    // Leaving on_hold clears the reason so a stale one cannot linger in the UI.
    if (fromStatus === "on_hold" && toStatus !== "on_hold") data.hold_reason = null;

    // Written on whichever transition demanded it, so the number lands with the
    // move that required it rather than waiting for a later step.
    if (input.stock_transfer_number) {
      data.stock_transfer_number = input.stock_transfer_number;
    }

    if (toStatus === "submitted_to_vendor") {
      data.vendor_name = input.vendor_name;
      data.vendor_rma_number = input.vendor_rma_number;
      data.customer_ticket_number = input.customer_ticket_number;
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
    if (toStatus === "ineligible") data.closed_at = now;
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
        note:
          input.note ||
          input.ineligibility_reason ||
          input.hold_reason ||
          input.decision_notes ||
          null,
        actor_id: session.userId,
      },
    });

    // Handover proof for a customer's unit. Uploaded after the status change has
    // committed, and a failure is logged rather than surfaced: losing a photo
    // must not undo a transition that already happened, exactly as on the
    // ineligible path below.
    if (toStatus === "submitted_to_vendor" && receiptFiles.length > 0) {
      for (const [i, file] of receiptFiles.entries()) {
        const ext = getExt(file.type, file.name);
        const path = `tickets/${rmaCase.ticket_id}/rma-receipt_${rmaCase.rma_code}_${i + 1}.${ext}`;
        try {
          const url = await uploadToR2(file, path);
          await db.ticketAttachment.create({
            data: {
              ticket_id: rmaCase.ticket_id,
              file_url: url,
              file_type: getFileType(file.type),
            },
          });
        } catch (err) {
          console.error("[RMA RECEIPT PHOTO UPLOAD ERROR]", err);
        }
      }
    }

    // ── The desk found the claim outside warranty cover ──
    // Written after the optimistic lock succeeded, so a losing concurrent
    // caller cannot mark the ticket ineligible. upsert because a warranty
    // ticket created before the detail row existed may not have one.
    if (toStatus === "ineligible") {
      for (const [i, file] of ineligibleFiles.entries()) {
        const ext = getExt(file.type, file.name);
        const path = `tickets/${rmaCase.ticket_id}/rma-ineligible_${rmaCase.rma_code}_${i + 1}.${ext}`;
        try {
          const url = await uploadToR2(file, path);
          await db.ticketAttachment.create({
            data: {
              ticket_id: rmaCase.ticket_id,
              file_url: url,
              file_type: getFileType(file.type),
            },
          });
        } catch (err) {
          // The status change already committed; losing a photo must not undo
          // it, so this is logged rather than surfaced as a failed transition.
          console.error("[RMA INELIGIBLE PHOTO UPLOAD ERROR]", err);
        }
      }

      await db.ticketWarrantyDetail.upsert({
        where: { ticket_id: rmaCase.ticket_id },
        create: {
          ticket_id: rmaCase.ticket_id,
          purchase_date: new Date(),
          claim_eligible: false,
          ineligibility_reason: input.ineligibility_reason,
        },
        update: {
          claim_eligible: false,
          ineligibility_reason: input.ineligibility_reason,
        },
      });
    }

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
                : toStatus === "ineligible"
                  ? `RMA case ${rmaCase.rma_code} — klaim tidak layak`
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
