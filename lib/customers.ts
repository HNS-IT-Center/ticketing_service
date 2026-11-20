/**
 * Data Customer (owner, 2026-11-19): the people who bring units in, one row
 * each, with their phone number and what they came for. Customers have no
 * account — their details are typed on every ticket — so a customer is the
 * tickets that share a name and a phone number. Not the number alone: on the
 * data, one number often stands for many people — a placeholder typed when the
 * customer gave none (0800000000 under 18 names), the sales' own number, a
 * company's office line. Pure: the page passes the tickets in.
 */
import type { TicketType } from "@prisma/client";
import { normalizePhone } from "@/lib/ticket-audit";
import { isStoreStockClaim } from "@/lib/ticket-party";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";

export const CUSTOMER_TICKET_TYPES = Object.keys(TICKET_TYPE_LABELS) as TicketType[];

export type CustomerTicket = {
  ticket_type: TicketType;
  created_at: Date;
  is_for_self: boolean;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  user: { name: string | null; role: string; phone_number: string | null; email: string | null } | null;
  store: string | null;
};

export type Customer = {
  /** "<normalised phone or ->|<lower-cased name>". */
  key: string;
  name: string;
  /** "+62812…", or null when no ticket carries a usable number. */
  phone: string | null;
  email: string | null;
  tickets: number;
  types: { type: TicketType; label: string; count: number }[];
  firstVisit: Date;
  lastVisit: Date;
  stores: string[];
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * A number someone can be reached on ("62812…"), or null for an empty or
 * placeholder one: all zeros (0800000000), one digit repeated, or too short
 * to be a mobile number.
 */
export function usablePhone(raw: string | null | undefined): string | null {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const local = phone.startsWith("62") ? phone.slice(2) : phone;
  if (local.length < 9 || /^8?(\d)\1+$/.test(local)) return null;
  return phone;
}

/**
 * Who a ticket was for, or null when it has no customer: a store-stock claim,
 * or a "for myself" ticket booked by a staff account (only a Customer
 * account's own details describe a customer).
 */
export function ticketCustomer(t: CustomerTicket): { name: string; phone: string | null; email: string | null } | null {
  if (t.is_for_self) {
    if (!t.user || t.user.role !== "Customer" || !clean(t.user.name)) return null;
    return { name: clean(t.user.name), phone: t.user.phone_number, email: t.user.email };
  }
  if (isStoreStockClaim(t)) return null;
  const name = clean(t.customer_name);
  // Old store-stock claims were opened under an invented name ("STOK TOKO GATEWAY").
  if (/^stok\s*toko\b/i.test(name)) return null;
  if (!name && !usablePhone(t.customer_phone)) return null;
  return { name: name || "Tanpa nama", phone: t.customer_phone, email: t.customer_email };
}

/**
 * One row per customer: tickets sharing a name (ignoring case and spacing) and
 * a usable number (0812… and +62812… are one). Without a usable number, the
 * name alone. Newest visit first; the e-mail shown is the latest one typed.
 */
export function groupCustomers(tickets: readonly CustomerTicket[]): Customer[] {
  const sorted = [...tickets].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const byKey = new Map<string, Customer & { typeCount: Map<TicketType, number>; storeSet: Set<string> }>();
  for (const t of sorted) {
    const c = ticketCustomer(t);
    if (!c) continue;
    const phone = usablePhone(c.phone);
    const key = `${phone ?? "-"}|${c.name.toLowerCase()}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        name: c.name,
        phone: phone ? `+${phone}` : null,
        email: clean(c.email) || null,
        tickets: 0,
        types: [],
        firstVisit: t.created_at,
        lastVisit: t.created_at,
        stores: [],
        typeCount: new Map(),
        storeSet: new Set(),
      };
      byKey.set(key, row);
    }
    row.tickets++;
    if (!row.email && clean(c.email)) row.email = clean(c.email);
    if (row.name === "Tanpa nama" && c.name !== "Tanpa nama") row.name = c.name;
    row.firstVisit = t.created_at; // sorted newest first, so the last one seen is the first visit
    row.typeCount.set(t.ticket_type, (row.typeCount.get(t.ticket_type) ?? 0) + 1);
    if (t.store) row.storeSet.add(t.store);
  }
  return [...byKey.values()].map(({ typeCount, storeSet, ...row }) => ({
    ...row,
    types: CUSTOMER_TICKET_TYPES.filter((ty) => typeCount.has(ty)).map((ty) => ({ type: ty, label: TICKET_TYPE_LABELS[ty], count: typeCount.get(ty)! })),
    stores: [...storeSet].sort(),
  }));
}

/** Search by name or number (any way it is typed), and keep customers who came for `type`. */
export function filterCustomers(list: readonly Customer[], q: string, type: TicketType | null): Customer[] {
  const text = clean(q).toLowerCase();
  const digits = normalizePhone(q) ?? (q.replace(/\D/g, "").length >= 4 ? q.replace(/\D/g, "") : null);
  return list.filter((c) => {
    if (type && !c.types.some((t) => t.type === type)) return false;
    if (!text) return true;
    if (c.name.toLowerCase().includes(text)) return true;
    if (c.email?.toLowerCase().includes(text)) return true;
    return Boolean(digits && c.phone?.replace(/\D/g, "").includes(digits.startsWith("62") ? digits : digits.replace(/^0/, "")));
  });
}

export function isCustomerTicketType(v: string | undefined): v is TicketType {
  return (CUSTOMER_TICKET_TYPES as string[]).includes(v ?? "");
}
