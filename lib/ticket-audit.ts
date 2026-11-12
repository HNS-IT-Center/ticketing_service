/**
 * Tickets that earned a technician points and may not be real work (owner,
 * 2026-11-12, after PC builds whose "customer" was the technician himself
 * showed 22 points each). Pure: the page loads, this judges.
 *
 * Each reason is a prompt to look, not proof. A technician may put their own
 * number on a ticket when a walk-in customer gives none; a colleague may
 * genuinely bring a laptop in. What is suspicious is the pattern, which is why
 * the page totals them per technician.
 *
 * A fast finish is deliberately not a reason: many real tickets are typed in
 * after the work is done, so "done 0 minutes after it was created" is common
 * and honest.
 */

export type AuditStaff = { name: string; phone_number: string | null };

export type AuditTicket = {
  customer: string | null;
  customer_phone: string | null;
  device_name: string | null;
  extra_ticks: number;
};

export type AuditReason =
  | { kind: "staff_name"; staff: string }
  | { kind: "staff_phone"; staff: string }
  | { kind: "test_data" }
  | { kind: "many_ticks"; ticks: number };

/** Old "Extra Services" ticks from this many up are worth a look. */
export const MANY_TICKS = 3;

const TEST_WORDS = /(^|[^a-z])(test|testing|tes|coba|dummy|asd|qwe|zxc|xxx)([^a-z]|$)/;

/** Digits only, Indonesian mobile numbers on one form: 0812… and +62812… compare equal. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function auditReasons(t: AuditTicket, staff: readonly AuditStaff[]): AuditReason[] {
  const reasons: AuditReason[] = [];
  const customer = norm(t.customer);
  if (customer) {
    // Whole name, or a staff member's first name typed on its own ("Febrian").
    const match = staff.find((s) => {
      const full = norm(s.name);
      return full.length > 0 && (customer === full || customer === full.split(" ")[0]);
    });
    if (match) reasons.push({ kind: "staff_name", staff: match.name });
  }
  const phone = normalizePhone(t.customer_phone);
  if (phone) {
    const match = staff.find((s) => normalizePhone(s.phone_number) === phone);
    if (match) reasons.push({ kind: "staff_phone", staff: match.name });
  }
  if (TEST_WORDS.test(`${customer} ${norm(t.device_name)}`)) reasons.push({ kind: "test_data" });
  if (t.extra_ticks >= MANY_TICKS) reasons.push({ kind: "many_ticks", ticks: t.extra_ticks });
  return reasons;
}

export function reasonText(r: AuditReason): string {
  switch (r.kind) {
    case "staff_name":
      return `Nama customer sama dengan staf (${r.staff})`;
    case "staff_phone":
      return `No. HP customer milik staf (${r.staff})`;
    case "test_data":
      return "Nama seperti data uji";
    case "many_ticks":
      return `${r.ticks} centang Extra Services lama`;
    default: {
      const never: never = r;
      return never;
    }
  }
}

/** The old ticks, from the Json column, however it was stored. */
export function tickCount(extra: unknown): number {
  return Array.isArray(extra) ? extra.length : 0;
}
