import type { RmaHoldReason } from "@prisma/client";

/**
 * Why a case is held, and what the system does about it.
 *
 * Holding a case used to be a free-text note and nothing else. The note sat on
 * the case page where only the RMA desk reads it, so when the hold was "the
 * damage video was never sent", the desk had to go and ask for it by hand — and
 * a real case sat held with exactly that reason written in capitals.
 *
 * Three of the four reasons are things only the technician who handed the unit
 * over can supply. Choosing one of those asks them for it by name, in a panel
 * on their own ticket page. `other` is everything else: no automatic request
 * could help, so the desk writes what happened and an administrator is told.
 *
 * `asksTechnicianFor` is the single switch. Nothing else in the codebase
 * decides whether a hold reaches the technician.
 */

export type RmaHoldReasonMeta = {
  /** What the RMA desk picks from. */
  label: string;
  /** Shown to the technician as the thing being asked for. `null` asks nobody. */
  asksTechnicianFor: string | null;
  /** `accept` for the technician's upload, when something is asked for. */
  accept: string | null;
  /** Whether the desk must also type an explanation. */
  requiresNote: boolean;
};

/**
 * Exhaustive over `RmaHoldReason` on purpose — a reason added to the schema
 * without a decision about who it asks fails the build rather than silently
 * asking nobody.
 */
export const RMA_HOLD_REASONS: Record<RmaHoldReason, RmaHoldReasonMeta> = {
  missing_damage_video: {
    label: "Video kerusakan belum ada",
    asksTechnicianFor: "video kondisi/kerusakan unit",
    accept: "video/*,video/quicktime",
    requiresNote: false,
  },
  missing_damage_photo: {
    label: "Foto kerusakan kurang atau tidak jelas",
    asksTechnicianFor: "foto kondisi/kerusakan unit",
    accept: "image/*,image/heic,image/heif",
    requiresNote: false,
  },
  missing_purchase_invoice: {
    label: "Nota pembelian belum ada atau tidak terbaca",
    asksTechnicianFor: "foto atau PDF nota pembelian",
    accept: "image/*,image/heic,image/heif,application/pdf",
    requiresNote: false,
  },
  other: {
    label: "Lainnya",
    asksTechnicianFor: null,
    accept: null,
    requiresNote: true,
  },
};

/** The order the desk sees them in: the three actionable ones, then `other`. */
export const RMA_HOLD_REASON_ORDER: readonly RmaHoldReason[] = [
  "missing_damage_video",
  "missing_damage_photo",
  "missing_purchase_invoice",
  "other",
];

export function holdReasonMeta(code: RmaHoldReason): RmaHoldReasonMeta {
  return RMA_HOLD_REASONS[code];
}

/** Whether this hold sends a request back to the handover technician. */
export function holdReasonAsksTechnician(code: RmaHoldReason | null | undefined): boolean {
  if (!code) return false;
  return RMA_HOLD_REASONS[code].asksTechnicianFor !== null;
}

/** Whether the desk must type an explanation alongside the category. */
export function holdReasonRequiresNote(code: RmaHoldReason | null | undefined): boolean {
  if (!code) return false;
  return RMA_HOLD_REASONS[code].requiresNote;
}

export function isRmaHoldReason(value: string): value is RmaHoldReason {
  return Object.prototype.hasOwnProperty.call(RMA_HOLD_REASONS, value);
}

/** The sentence the technician is shown, and the one the notification carries. */
export function holdRequestSentence(code: RmaHoldReason): string {
  const asked = RMA_HOLD_REASONS[code].asksTechnicianFor;
  return asked
    ? `Tim RMA meminta ${asked} untuk melanjutkan klaim ini.`
    : "Tim RMA menahan klaim ini. Hubungi administrator untuk detailnya.";
}
