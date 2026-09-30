/**
 * RMA state machine — pure module, no database access.
 *
 * Every rule about how an RmaCase may move between states lives here so it can
 * be unit tested in isolation. Server actions call `validateRmaTransition()` to
 * check a move; the UI calls `getAllowedTransitions()` to decide which buttons
 * to render. Neither should hardcode its own copy of these rules.
 */

import type { RmaStatus, RmaDecision, UnitOwnership } from "@prisma/client";

// ── Roles allowed to drive an RMA case ──────────────────────────────────────
// Administrator can do everything the RMA desk can.
export const RMA_ACTOR_ROLES = ["RMA", "Administrator"] as const;
export type RmaActorRole = (typeof RMA_ACTOR_ROLES)[number];

export function canActOnRma(role: string): role is RmaActorRole {
  return (RMA_ACTOR_ROLES as readonly string[]).includes(role);
}

// ── Fields a transition may demand ──────────────────────────────────────────
export type RmaTransitionField =
  | "hold_reason"
  | "stock_transfer_number"
  | "customer_ticket_number"
  | "ineligibility_reason"
  | "vendor_name"
  | "vendor_rma_number"
  | "decision"
  | "replacement_sn";

/** Payload supplied by the caller when requesting a transition. */
export type RmaTransitionInput = {
  hold_reason?: string | null;
  stock_transfer_number?: string | null;
  customer_ticket_number?: string | null;
  ineligibility_reason?: string | null;
  vendor_name?: string | null;
  vendor_rma_number?: string | null;
  shipping_tracking?: string | null;
  decision?: RmaDecision | null;
  decision_notes?: string | null;
  replacement_sn?: string | null;
  note?: string | null;
};

export type RmaTransition = {
  from: RmaStatus;
  to: RmaStatus;
  /** Button label shown in the RMA portal. */
  label: string;
  /** Fields that must be non-empty for this transition to be accepted. */
  requires: readonly RmaTransitionField[];
  /** Short explanation rendered under the button / in the confirm dialog. */
  description: string;
};

// ── The transition table ────────────────────────────────────────────────────
export const RMA_TRANSITIONS: readonly RmaTransition[] = [
  {
    from: "pending_verification",
    to: "verified",
    label: "Verifikasi Lolos",
    requires: [],
    description:
      "Dokumen, serial number, dan kondisi fisik sudah sesuai. Unit stok toko wajib mencantumkan nomor pemindahan stok.",
  },
  {
    from: "pending_verification",
    to: "on_hold",
    label: "Tahan (Data Kurang)",
    requires: ["hold_reason"],
    description: "Ada dokumen atau data yang kurang. Wajib isi alasan.",
  },
  {
    from: "pending_verification",
    to: "ineligible",
    label: "Tidak Layak Klaim",
    requires: ["ineligibility_reason"],
    description:
      "Unit diperiksa dan di luar cakupan garansi. Tidak diajukan ke vendor. Alasan tampil ke customer.",
  },
  {
    from: "pending_verification",
    to: "cancelled",
    label: "Batalkan Klaim",
    requires: ["hold_reason"],
    description: "Klaim dibatalkan sebelum diajukan ke vendor. Wajib isi alasan.",
  },
  {
    from: "on_hold",
    to: "pending_verification",
    label: "Verifikasi Ulang",
    requires: [],
    description: "Kekurangan sudah dilengkapi, kembali ke antrean verifikasi.",
  },
  {
    from: "on_hold",
    to: "in_vendor_process",
    label: "Lanjut Proses Vendor",
    requires: [],
    description: "Hambatan dari sisi vendor sudah teratasi.",
  },
  {
    from: "on_hold",
    to: "ineligible",
    label: "Tidak Layak Klaim",
    requires: ["ineligibility_reason"],
    description:
      "Setelah kekurangan ditelusuri, ternyata di luar cakupan garansi. Alasan tampil ke customer.",
  },
  {
    from: "on_hold",
    to: "cancelled",
    label: "Batalkan Klaim",
    requires: ["hold_reason"],
    description: "Klaim dibatalkan saat tertahan. Wajib isi alasan.",
  },
  {
    from: "verified",
    to: "submitted_to_vendor",
    label: "Ajukan ke Vendor",
    // vendor_rma_number is demanded conditionally in validateRmaTransition:
    // only a store-stock unit is claimed against a supplier.
    requires: ["vendor_name"],
    description:
      "Wajib isi nama vendor. Unit stok toko juga wajib nomor klaim pemasok.",
  },
  {
    from: "verified",
    to: "ineligible",
    label: "Tidak Layak Klaim",
    requires: ["ineligibility_reason"],
    description:
      "Sudah lolos verifikasi tapi ternyata di luar cakupan garansi, sebelum dikirim ke vendor.",
  },
  {
    from: "submitted_to_vendor",
    to: "in_vendor_process",
    label: "Vendor Memproses",
    requires: [],
    description: "Unit sudah diterima vendor dan mulai diproses.",
  },
  {
    from: "submitted_to_vendor",
    to: "on_hold",
    label: "Tahan",
    requires: ["hold_reason"],
    description: "Pengajuan tertahan. Wajib isi alasan.",
  },
  {
    from: "in_vendor_process",
    to: "vendor_decided",
    label: "Catat Keputusan Vendor",
    requires: ["decision"],
    description:
      "Wajib pilih keputusan. Serial number pengganti wajib jika unit diganti.",
  },
  {
    from: "in_vendor_process",
    to: "on_hold",
    label: "Tahan",
    requires: ["hold_reason"],
    description: "Proses vendor tertahan. Wajib isi alasan.",
  },
  {
    from: "vendor_decided",
    to: "unit_received",
    label: "Unit Diterima Kembali",
    requires: [],
    description: "Unit sudah kembali dari vendor ke toko.",
  },
  {
    from: "unit_received",
    to: "closed",
    label: "Tutup Case",
    requires: [],
    description: "Case selesai. Tiket kembali ke alur serah terima ke customer.",
  },
];

/** States from which no further transition is possible. */
export const RMA_TERMINAL_STATUSES: readonly RmaStatus[] = [
  "closed",
  "cancelled",
  "ineligible",
];

export function isTerminalRmaStatus(status: RmaStatus): boolean {
  return RMA_TERMINAL_STATUSES.includes(status);
}

/**
 * Statuses that hand the parent ticket back to the normal workflow.
 * Both move the ticket from `rma_process` back to `done`.
 */
export const RMA_STATUSES_RELEASING_TICKET: readonly RmaStatus[] = [
  "closed",
  "cancelled",
  // The unit still has to go back to its owner, so the ticket returns to `done`
  // and takes the ordinary handover chain, exactly as a closed case does.
  "ineligible",
];

export function releasesTicket(status: RmaStatus): boolean {
  return RMA_STATUSES_RELEASING_TICKET.includes(status);
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/** Every transition available from `from`, ignoring payload validation. */
export function getAllowedTransitions(from: RmaStatus): RmaTransition[] {
  return RMA_TRANSITIONS.filter((t) => t.from === from);
}

/** The transition definition for `from -> to`, or null if the move is illegal. */
export function findTransition(from: RmaStatus, to: RmaStatus): RmaTransition | null {
  return RMA_TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type RmaValidationResult =
  | { ok: true; transition: RmaTransition }
  | { ok: false; error: string; missing?: RmaTransitionField[] };

const FIELD_LABELS: Record<RmaTransitionField, string> = {
  hold_reason: "Alasan",
  stock_transfer_number: "Nomor pemindahan stok",
  customer_ticket_number: "Nomor tiket user",
  ineligibility_reason: "Alasan tidak layak klaim",
  vendor_name: "Nama vendor",
  vendor_rma_number: "Nomor klaim pemasok",
  decision: "Keputusan vendor",
  replacement_sn: "Serial number pengganti",
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Single entry point used by the server action.
 *
 * Checks, in order: the role of the actor, that `from -> to` exists, and that
 * every field the transition demands is present. `replacement_sn` is only
 * demanded when the vendor decision is `replaced`, so it is resolved here
 * rather than being listed statically in the table.
 */
export function validateRmaTransition(args: {
  role: string;
  from: RmaStatus;
  to: RmaStatus;
  input?: RmaTransitionInput;
  /**
   * Where the unit came from. Passed in rather than read from the database so
   * this module stays pure and testable without one, the same reason
   * `replacement_sn` resolves from `input.decision` here instead of being
   * listed statically in the table.
   *
   * Optional so existing callers keep compiling; when it is absent the
   * store-stock requirement simply does not apply.
   */
  unitOwnership?: UnitOwnership | null;
}): RmaValidationResult {
  const { role, from, to, input = {}, unitOwnership = null } = args;

  if (!canActOnRma(role)) {
    return {
      ok: false,
      error: "Hanya tim RMA dan Administrator yang dapat mengubah status klaim.",
    };
  }

  if (isTerminalRmaStatus(from)) {
    return { ok: false, error: `Case sudah "${from}" dan tidak dapat diubah lagi.` };
  }

  const transition = findTransition(from, to);
  if (!transition) {
    return { ok: false, error: `Perpindahan status "${from}" ke "${to}" tidak diizinkan.` };
  }

  const required: RmaTransitionField[] = [...transition.requires];
  // Conditional requirement: a replaced unit must carry its new serial number.
  if (to === "vendor_decided" && input.decision === "replaced") {
    required.push("replacement_sn");
  }
  // Conditional requirement: a unit taken from store stock physically moves from
  // the store warehouse into the claim warehouse, and that movement has a
  // transfer document. The number is demanded before the case may proceed, so
  // the unit can still be traced once it has left the shop floor.
  //
  // Applied to both routes that carry a case forward, not only the obvious one.
  // `verified` is where it belongs, but `on_hold -> in_vendor_process` reaches
  // the vendor without passing through `verified`, and a requirement that one
  // path can walk around is worse than none: it reads as enforced.
  //
  // A customer's own unit is never transferred, so nothing is demanded of it.
  if (
    unitOwnership === "store_stock" &&
    (to === "verified" || to === "in_vendor_process")
  ) {
    required.push("stock_transfer_number");
  }
  // Only a store-stock unit is claimed against the shop's own supplier, so only
  // it carries a supplier claim number. A customer's unit records the reference
  // the outside party gave instead (`customer_ticket_number`), which is often
  // not issued yet when the unit is sent, so nothing is demanded for it here.
  if (unitOwnership === "store_stock" && to === "submitted_to_vendor") {
    required.push("vendor_rma_number");
  }

  const missing = required.filter((field) => isBlank(input[field]));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `${missing.map((f) => FIELD_LABELS[f]).join(", ")} wajib diisi.`,
      missing,
    };
  }

  return { ok: true, transition };
}
