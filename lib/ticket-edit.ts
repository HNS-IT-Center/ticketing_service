/**
 * Correcting a ticket's intake data after it was created — a unit typed wrong,
 * a missing SN, a customer's number with a digit swapped (owner, 2026-11-08).
 *
 * Who may is the `edit_ticket` setting in Admin → Pengaturan Akses. Pure: the
 * action parses and compares here, the tests need no database. Every change is
 * written to the activity log with what it was before, so a correction can be
 * traced and undone by hand.
 */

export const EDITABLE_FIELDS = [
  "device_name",
  "device_sn",
  "accessories",
  "device_condition",
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const FIELD_LABELS: Record<EditableField, string> = {
  device_name: "Nama unit",
  device_sn: "SN",
  accessories: "Kelengkapan",
  device_condition: "Kondisi unit",
  customer_name: "Nama customer",
  customer_phone: "No. HP customer",
  customer_email: "Email customer",
  customer_address: "Alamat customer",
};

/** VARCHAR(191) columns: longer is refused by the database (STRICT_TRANS_TABLES). */
const SHORT: ReadonlySet<EditableField> = new Set(["device_sn", "customer_name", "customer_phone", "customer_email"]);
const SHORT_MAX = 191;
const LONG_MAX = 5000;

export type TicketEditValues = Record<EditableField, string | null>;

/** What the ticket is, which decides the required fields — the intake's rules. */
export type TicketEditContext = {
  ticketType: string;
  /** Ticket opened for the account holder: the customer is the account, not these fields. */
  isForSelf: boolean;
  /** A claim on the shop's own stock has no customer. */
  storeStock: boolean;
};

/** Whether the customer fields belong to this ticket at all. */
export function hasCustomerFields(ctx: TicketEditContext): boolean {
  return !ctx.isForSelf && !ctx.storeStock;
}

/**
 * "+62…" as every phone in this app is stored. Accepts what people type:
 * 0812…, 62812…, +62 812-…, 812…. Null when empty.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // "+62…" loses exactly its prefix, so a stored number comes back unchanged.
  const local = digits.startsWith("62") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  return local ? `+62${local}` : null;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
// Free text keeps its line breaks.
const cleanText = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").trim();
  return t ? t : null;
};

export type ParseResult = { ok: true; values: TicketEditValues } | { ok: false; error: string };

/**
 * The submitted values, cleaned and checked. Fields that do not belong to the
 * ticket (customer fields on a store-stock claim) come back unchanged from
 * `current`, whatever was sent.
 */
export function parseTicketEdit(
  input: Partial<Record<EditableField, unknown>>,
  current: TicketEditValues,
  ctx: TicketEditContext,
): ParseResult {
  const customer = hasCustomerFields(ctx);
  const values: TicketEditValues = {
    device_name: clean(input.device_name),
    device_sn: clean(input.device_sn),
    accessories: cleanText(input.accessories),
    device_condition: cleanText(input.device_condition),
    customer_name: customer ? clean(input.customer_name) : current.customer_name,
    customer_phone: customer ? normalizePhone(clean(input.customer_phone)) : current.customer_phone,
    customer_email: customer ? clean(input.customer_email)?.toLowerCase() ?? null : current.customer_email,
    customer_address: customer ? cleanText(input.customer_address) : current.customer_address,
  };

  for (const f of EDITABLE_FIELDS) {
    const v = values[f];
    if (v && v.length > (SHORT.has(f) ? SHORT_MAX : LONG_MAX)) {
      return { ok: false, error: `${FIELD_LABELS[f]} terlalu panjang (maks. ${SHORT.has(f) ? SHORT_MAX : LONG_MAX} karakter).` };
    }
  }
  // Clearing a unit name that was there would leave the ticket saying nothing.
  if (!values.device_name && current.device_name) return { ok: false, error: "Nama unit tidak boleh dikosongkan." };
  if (ctx.ticketType === "warranty_claim" && !values.device_sn) {
    return { ok: false, error: "SN wajib diisi untuk klaim garansi." };
  }
  if (customer) {
    if (!values.customer_name) return { ok: false, error: "Nama customer wajib diisi." };
    if (ctx.ticketType === "warranty_claim" && !values.customer_phone) {
      return { ok: false, error: "No. HP customer wajib diisi untuk klaim garansi." };
    }
    if (values.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customer_email)) {
      return { ok: false, error: "Format email customer tidak valid." };
    }
  }
  return { ok: true, values };
}

export type FieldChange = { field: EditableField; from: string | null; to: string | null };

/** Only the fields that actually changed, in form order. */
export function diffTicketEdit(current: TicketEditValues, next: TicketEditValues): FieldChange[] {
  return EDITABLE_FIELDS.filter((f) => (current[f] ?? null) !== (next[f] ?? null)).map((f) => ({
    field: f,
    from: current[f] ?? null,
    to: next[f] ?? null,
  }));
}

const quote = (v: string | null) => (v === null ? "(kosong)" : `"${v.length > 120 ? `${v.slice(0, 119)}…` : v}"`);

/** One line for the activity log: every change with what it was before. */
export function describeChanges(code: string, changes: FieldChange[], catalogNote?: string | null): string {
  const parts = changes.map((c) => `${FIELD_LABELS[c.field]}: ${quote(c.from)} → ${quote(c.to)}`);
  if (catalogNote) parts.push(catalogNote);
  return `Mengubah data tiket ${code} — ${parts.join("; ")}.`;
}
