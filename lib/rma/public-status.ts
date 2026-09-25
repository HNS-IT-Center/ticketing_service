/**
 * Customer-facing wording for the public tracking page — pure module, no
 * database access.
 *
 * Two jobs:
 *
 *   1. `PUBLIC_STATUS_LABELS` turns a raw `TicketStatus` into something a
 *      customer can read. The public page used to render
 *      `log.new_status.replace(/_/g, " ")`, which leaked enum names such as
 *      "rma process" straight into the timeline.
 *
 *   2. `getPublicClaimOutcome()` decides the one-line verdict shown above the
 *      timeline for a warranty claim. Without it all three endings — not
 *      eligible, rejected by the vendor, and genuinely repaired — finish as
 *      `done` → `completed` and look identical to the customer.
 *
 * The function deliberately accepts only status, decision and the
 * ineligibility reason. `vendor_rma_number`, `hold_reason`, `decision_notes`,
 * `stock_origin` and `RmaEvent.note` are internal, so they are not parameters
 * here and cannot reach the page through this module.
 */

import type {
  RmaDecision,
  RmaStatus,
  TicketStatus,
  TicketType,
} from "@prisma/client";

// ── Timeline labels ─────────────────────────────────────────────────────────

export const PUBLIC_STATUS_LABELS: Record<TicketStatus, string> = {
  waiting: "Diterima",
  on_progress: "Sedang Dikerjakan",
  rma_process: "Proses Klaim Garansi",
  done: "Selesai Dikerjakan",
  ready_for_pickup: "Siap Diambil",
  waiting_pickup: "Menunggu Diambil",
  handed_to_courier: "Diserahkan ke Kurir",
  delivered: "Terkirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

/** Falls back to the de-underscored enum name so an unmapped status still reads. */
export function publicStatusLabel(status: string): string {
  return (
    PUBLIC_STATUS_LABELS[status as TicketStatus] ?? status.replace(/_/g, " ")
  );
}

// ── Claim outcome banner ────────────────────────────────────────────────────

export type PublicClaimOutcome = {
  /** Drives the banner colour. */
  tone: "progress" | "success" | "warning" | "neutral";
  /** One line, safe to show a customer. */
  headline: string;
  /** Optional second line. Only ever the technician's ineligibility reason. */
  detail?: string;
};

/** Stage wording while the unit is still with the RMA desk or the vendor. */
const IN_PROGRESS_HEADLINE: Record<RmaStatus, string> = {
  pending_verification: "Klaim sedang diverifikasi",
  on_hold: "Klaim sedang diverifikasi",
  verified: "Klaim sedang diverifikasi",
  submitted_to_vendor: "Klaim sedang diproses vendor",
  in_vendor_process: "Klaim sedang diproses vendor",
  vendor_decided: "Keputusan vendor sudah keluar",
  unit_received: "Keputusan vendor sudah keluar",
  closed: "Klaim sedang diproses",
  cancelled: "Klaim sedang diproses",
  // Unreachable in practice: an ineligible case releases the ticket out of
  // `rma_process`, and the claim_eligible=false branch answers first. Present
  // because the map is exhaustive, and a wrong label here would leak.
  ineligible: "Klaim sedang diproses",
};

const DECISION_HEADLINE: Record<RmaDecision, string> = {
  repaired: "Unit diperbaiki oleh vendor",
  replaced: "Unit diganti oleh vendor",
  refund: "Dana dikembalikan",
  rejected: "Klaim ditolak vendor",
};

export function getPublicClaimOutcome(args: {
  ticketType: TicketType;
  ticketStatus: TicketStatus;
  claimEligible: boolean | null;
  ineligibilityReason: string | null;
  rmaStatus: RmaStatus | null;
  rmaDecision: RmaDecision | null;
}): PublicClaimOutcome | null {
  const {
    ticketType,
    ticketStatus,
    claimEligible,
    ineligibilityReason,
    rmaStatus,
    rmaDecision,
  } = args;

  if (ticketType !== "warranty_claim") return null;

  // Checked by the technician and found outside warranty. Takes priority: such
  // a ticket never reaches the RMA desk, so there is no case to report on.
  if (claimEligible === false) {
    return {
      tone: "warning",
      headline: "Klaim tidak memenuhi syarat garansi",
      detail: ineligibilityReason?.trim() || undefined,
    };
  }

  // Still at the RMA desk or the vendor. The ticket status is the authority
  // here — the case status only refines the wording.
  if (ticketStatus === "rma_process") {
    return {
      tone: "progress",
      headline: rmaStatus
        ? IN_PROGRESS_HEADLINE[rmaStatus]
        : "Klaim sedang diproses",
    };
  }

  if (rmaDecision) {
    return {
      tone: rmaDecision === "rejected" ? "warning" : "success",
      headline: DECISION_HEADLINE[rmaDecision],
    };
  }

  // The case was dropped before any vendor decision — the unit comes back
  // untouched. Why it was dropped is internal, so only the fact is shown.
  if (rmaStatus === "cancelled") {
    return { tone: "neutral", headline: "Proses klaim dihentikan" };
  }

  // Claim raised but not yet examined: the timeline already says everything.
  return null;
}
