"use server";

import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";

export type KnownCustomer = { name: string; tickets: number; lastAt: string };

/**
 * A returning customer, found by the WhatsApp number typed at intake: the name
 * on their most recent ticket, how many tickets carry the number, and when the
 * last one was opened. Staff who may create tickets only. Returns null for a
 * number nobody has used, or one too short to be a phone number.
 */
export async function findCustomerByPhoneAction(digits: string): Promise<KnownCustomer | null> {
  await requireRole("Technician", "Sales", "Administrator", "RMA");
  const clean = (digits ?? "").replace(/\D/g, "").replace(/^0+/, "").replace(/^62/, "");
  if (clean.length < 9 || clean.length > 13) return null;
  // A string of zeros (+62800000000) is what staff type to get past the form;
  // it belongs to nobody and must not suggest a stranger's name.
  if (/^8?0+$/.test(clean)) return null;

  const phone = `+62${clean}`;
  const where = { customer_phone: phone, customer_name: { not: null } };
  const [latest, tickets] = await Promise.all([
    db.ticket.findFirst({ where, orderBy: { created_at: "desc" }, select: { customer_name: true, created_at: true } }),
    db.ticket.count({ where }),
  ]);
  if (!latest?.customer_name?.trim()) return null;
  return { name: latest.customer_name.trim(), tickets, lastAt: latest.created_at.toISOString() };
}
