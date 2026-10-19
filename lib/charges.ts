/**
 * A service ticket's bill — "Rincian Biaya" — as pure rules.
 *
 * No database and no server imports, so the panel, the actions, the invoice and
 * the tests all read the same labels, the same arithmetic and the same answer
 * to "may this person change this bill". The prices themselves are guarded by
 * capabilities (`lib/access.ts`); this module decides the other half — whose
 * ticket it is.
 */

import type { ChargeKind, ExternalResult, ServicePart, TicketStatus } from "@prisma/client";
import type { Audience } from "@/lib/access";
import { servicePartLabel } from "@/lib/service-parts";
import { VENDOR_ROLE_INFO, type VendorRoles } from "@/lib/vendors";

/** Per unit, in Rupiah. A billion is far above any part or repair this shop bills. */
export const MAX_UNIT_AMOUNT = 999_999_999;
export const MAX_CHARGE_QUANTITY = 99;
export const MAX_DESCRIPTION = 300;

/**
 * Kinds that are added by hand. A part line is never added here: it is created
 * with the replaced part it prices, so the bill cannot list a part the
 * technician did not record, nor miss one they did.
 */
export const ADDABLE_CHARGE_KINDS: readonly ChargeKind[] = ["service_fee", "external_service", "other"];

export function chargeKindLabel(kind: ChargeKind): string {
  switch (kind) {
    case "part":
      return "Part";
    case "external_service":
      return "Service eksternal";
    case "service_fee":
      return "Jasa service";
    case "other":
      return "Lainnya";
    default: {
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}

export function isAddableChargeKind(value: string): value is ChargeKind {
  return (ADDABLE_CHARGE_KINDS as readonly string[]).includes(value);
}

export function externalResultLabel(result: ExternalResult): string {
  switch (result) {
    case "repaired":
      return "Berhasil diperbaiki";
    case "not_repaired":
      return "Tidak bisa diperbaiki";
    default: {
      const _exhaustive: never = result;
      return String(_exhaustive);
    }
  }
}

export function isExternalResult(value: string): value is ExternalResult {
  return value === "repaired" || value === "not_repaired";
}

/**
 * What a part line is called on the bill: the item's own name when there is
 * one, else the category. The migration that backfilled existing parts uses
 * the same rule, in SQL.
 */
export function partChargeDescription(part: ServicePart, itemName: string | null | undefined): string {
  const name = itemName?.trim();
  return name ? name : servicePartLabel(part);
}

export type ParsedAmount = { ok: true; value: number | null } | { ok: false };

/**
 * Read a Rupiah amount as people type it: "150000", "150.000", "Rp 150.000",
 * "150.000,00". Empty means "not filled in yet" (null), which is not the same
 * as 0 — a warranty swap is billed at 0 on purpose.
 */
export function parseRupiah(raw: string | null | undefined): ParsedAmount {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^rp\.?/i, "")
    .replace(/[\s.]/g, "")
    .replace(/,0{1,2}$/, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+$/.test(cleaned)) return { ok: false };
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value > MAX_UNIT_AMOUNT) return { ok: false };
  return { ok: true, value };
}

const RUPIAH = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function formatRupiah(amount: number): string {
  return RUPIAH.format(amount);
}

/** Digits grouped the Indonesian way, for an input box: 150000 → "150.000". */
export function groupDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Whether a line's cost is something the shop paid someone. The shop's own
 * labour is not bought in, so a missing cost there is not a gap in the margin.
 */
export function costApplies(kind: ChargeKind): boolean {
  return kind !== "service_fee";
}

export type ChargeLine = {
  kind: ChargeKind;
  quantity: number;
  unit_price: number | null;
  /** Undefined when the viewer may not see costs; the summary then leaves them out. */
  unit_cost?: number | null;
};

export type ChargeSummary = {
  /** Sum of priced lines. */
  total: number;
  /** Lines still without a selling price. */
  unpriced: number;
  /** Sum of the costs that are filled in. */
  cost: number;
  /** Lines that were bought in but whose cost is still empty. */
  uncosted: number;
  margin: number;
  /** True when every price and every relevant cost is filled, so the margin is the real one. */
  complete: boolean;
};

export function summarizeCharges(lines: readonly ChargeLine[]): ChargeSummary {
  let total = 0;
  let unpriced = 0;
  let cost = 0;
  let uncosted = 0;
  for (const line of lines) {
    if (line.unit_price === null) unpriced += 1;
    else total += line.unit_price * line.quantity;
    if (typeof line.unit_cost === "number") cost += line.unit_cost * line.quantity;
    else if (line.unit_cost === null && costApplies(line.kind)) uncosted += 1;
  }
  return { total, unpriced, cost, uncosted, margin: total - cost, complete: unpriced === 0 && uncosted === 0 };
}

/** Where external work stands. `null` for every other kind of line. */
export function externalState(line: {
  kind: ChargeKind;
  sent_at: Date | string | null;
  returned_at: Date | string | null;
}): "at_vendor" | "returned" | null {
  if (line.kind !== "external_service") return null;
  if (line.returned_at) return "returned";
  return line.sent_at ? "at_vendor" : null;
}

type BillingRoles = Pick<VendorRoles, "supplies_parts" | "repairs">;

/**
 * Which vendors fit which kind of line: work sent out goes to a repairer, a
 * part comes from a supplier. A vendor that only takes warranty claims is not
 * someone the shop pays for a service, so it fits none of them.
 */
export function vendorFitsCharge(kind: ChargeKind, vendor: BillingRoles): boolean {
  switch (kind) {
    case "external_service":
      return vendor.repairs;
    case "part":
      return vendor.supplies_parts;
    case "other":
      return vendor.supplies_parts || vendor.repairs;
    case "service_fee":
      return false;
    default: {
      const _exhaustive: never = kind;
      return Boolean(_exhaustive);
    }
  }
}

/** Why a vendor does not fit a line, naming the role to tick in the vendor list. */
export function vendorMismatchMessage(kind: ChargeKind): string {
  const role =
    kind === "external_service"
      ? VENDOR_ROLE_INFO.repairs.label
      : kind === "part"
        ? VENDOR_ROLE_INFO.supplies_parts.label
        : `${VENDOR_ROLE_INFO.supplies_parts.label} atau ${VENDOR_ROLE_INFO.repairs.label}`;
  return `Vendor ini tidak ditandai sebagai ${role}. Centang perannya di Daftar Vendor bila keliru.`;
}

export type ChargePermissions = {
  /** May change this ticket's bill at all. */
  canEdit: boolean;
  canEditPrice: boolean;
  canEditCost: boolean;
  canViewCost: boolean;
  canViewMargin: boolean;
  canPrintInvoice: boolean;
};

/** One line as a client component receives it. `unit_cost` is absent unless the viewer may see it. */
export type ChargeRow = {
  id: string;
  kind: ChargeKind;
  description: string;
  quantity: number;
  unit_price: number | null;
  unit_cost?: number | null;
  vendor: { id: string; name: string } | null;
  is_part: boolean;
  sent_at: string | null;
  returned_at: string | null;
  external_result: ExternalResult | null;
  external_note: string | null;
  created_by_name: string;
};

export type VendorOption = { id: string; name: string } & BillingRoles;

/** Statuses after which the bill is settled for everyone but the senior staff. */
export const BILL_CLOSED_STATUSES: readonly TicketStatus[] = ["completed", "cancelled", "rejected"];

export const EXTERNAL_WORK_OUTSTANDING =
  "Masih ada pekerjaan di vendor yang belum diterima kembali. Catat penerimaannya dulu di Rincian Biaya.";

/**
 * Whether this person may change this ticket's bill at all. Which fields they
 * may set is a separate question, answered by `edit_price` and `edit_cost`.
 *
 * - An administrator and a head technician: any ticket, any time.
 * - A store coordinator: tickets of their own stores (and storeless ones, which
 *   belong to no store — the rule `lib/assignment-authority.ts` already follows).
 * - The technician holding the ticket, and the sales assigned to it: until the
 *   ticket is completed, cancelled or rejected. After that the bill has been
 *   paid or abandoned, and changing it would change a figure already reported.
 */
export function mayEditCharges(input: {
  userId: string;
  audiences: readonly Audience[];
  coordinatorStoreIds: readonly string[];
  ticket: {
    technician_id: string | null;
    sales_id: string | null;
    store_location_id: string | null;
    status: TicketStatus;
  };
}): boolean {
  const { userId, audiences, coordinatorStoreIds, ticket } = input;
  if (audiences.includes("administrator") || audiences.includes("head_technician")) return true;
  if (
    audiences.includes("coordinator") &&
    (ticket.store_location_id === null || coordinatorStoreIds.includes(ticket.store_location_id))
  ) {
    return true;
  }
  if (BILL_CLOSED_STATUSES.includes(ticket.status)) return false;
  if (audiences.includes("technician") && ticket.technician_id === userId) return true;
  if (audiences.includes("sales") && ticket.sales_id === userId) return true;
  return false;
}
