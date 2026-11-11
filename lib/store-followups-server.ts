import "server-only";
import type { TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { publicTicketPath } from "@/lib/routes";
import { ticketPartyName } from "@/lib/ticket-party";
import { readyForPickupText, waLink } from "@/lib/whatsapp";
import { AWAITING_CODE_PART_WHERE, ticketsAwaitingPartCodeWhere } from "@/lib/part-code-alerts";
import {
  AWAITING_PICKUP_STATUSES,
  TO_BE_BILLED_STATUSES,
  billingGap,
  daysSince,
  enteredStatusAt,
  urgencyOf,
  type FollowupKind,
  type Urgency,
} from "@/lib/store-followups";

export type FollowupItem = {
  /** Unique within its list: the ticket, or for vendor work the bill line. */
  key: string;
  ticketId: string;
  code: string;
  ticketType: TicketType;
  customer: string;
  device: string | null;
  technician: string | null;
  /** What is outstanding, in a few words. */
  detail: string;
  days: number;
  urgency: Urgency;
  /** WhatsApp reminder, pickup list only. */
  whatsapp?: string | null;
};

export type Followups = Record<FollowupKind, FollowupItem[]>;

const PARTY = { is_for_self: true, customer_name: true, user: { select: { name: true, phone_number: true } } } as const;

const byDays = (a: FollowupItem, b: FollowupItem) => b.days - a.days || a.code.localeCompare(b.code);

/** The four follow-up lists for the given stores, longest waiting first. */
export async function loadFollowups(storeIds: string[], now: number): Promise<Followups> {
  const inStores = { store_location_id: { in: storeIds } };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const [stale, pickup, vendor, billing, code] = await Promise.all([
    db.ticket.findMany({
      where: { ...inStores, status: { in: ["waiting", "on_progress"] } },
      select: {
        id: true,
        ticket_code: true,
        status: true,
        ticket_type: true,
        device_name: true,
        created_at: true,
        technician: { select: { name: true } },
        ...PARTY,
      },
    }),
    db.ticket.findMany({
      where: { ...inStores, status: { in: AWAITING_PICKUP_STATUSES } },
      select: {
        id: true,
        ticket_code: true,
        status: true,
        ticket_type: true,
        device_name: true,
        customer_phone: true,
        created_at: true,
        updated_at: true,
        public_share_token: true,
        public_short_code: true,
        technician: { select: { name: true } },
        status_logs: { where: { new_status: { in: AWAITING_PICKUP_STATUSES } }, select: { new_status: true, created_at: true } },
        ...PARTY,
      },
    }),
    db.ticketCharge.findMany({
      where: { kind: "external_service", sent_at: { not: null }, returned_at: null, ticket: inStores },
      select: {
        id: true,
        description: true,
        sent_at: true,
        vendor: { select: { name: true } },
        ticket: {
          select: { id: true, ticket_code: true, ticket_type: true, device_name: true, technician: { select: { name: true } }, ...PARTY },
        },
      },
    }),
    db.ticket.findMany({
      where: { ...inStores, ticket_type: "service", status: { in: TO_BE_BILLED_STATUSES } },
      select: {
        id: true,
        ticket_code: true,
        status: true,
        ticket_type: true,
        device_name: true,
        updated_at: true,
        technician: { select: { name: true } },
        charges: { select: { unit_price: true } },
        status_logs: { where: { new_status: "done" }, select: { new_status: true, created_at: true } },
        ...PARTY,
      },
    }),
    db.ticket.findMany({
      where: ticketsAwaitingPartCodeWhere(inStores),
      select: {
        id: true,
        ticket_code: true,
        ticket_type: true,
        device_name: true,
        updated_at: true,
        technician: { select: { name: true } },
        replaced_parts: { where: AWAITING_CODE_PART_WHERE, select: { item_name: true, part: true } },
        status_logs: { where: { new_status: "done" }, select: { new_status: true, created_at: true } },
        ...PARTY,
      },
    }),
  ]);

  const party = (t: Parameters<typeof ticketPartyName>[0]) => ticketPartyName(t) ?? "—";

  return {
    stale: stale
      .map((t) => {
        const days = daysSince(t.created_at, now);
        return {
          key: t.id,
          ticketId: t.id,
          code: t.ticket_code,
          ticketType: t.ticket_type,
          customer: party(t),
          device: t.device_name,
          technician: t.technician?.name ?? null,
          detail: t.status === "waiting" ? (t.technician ? "Belum mulai dikerjakan" : "Belum ada teknisi") : "Sedang dikerjakan",
          days,
          urgency: urgencyOf("stale", days),
        };
      })
      .sort(byDays),
    pickup: pickup
      .map((t) => {
        const days = daysSince(enteredStatusAt(t.status, t.status_logs, t.updated_at), now);
        const name = party(t);
        const path = publicTicketPath(t.created_at, t.public_share_token, t.public_short_code);
        const phone = t.is_for_self ? t.user?.phone_number : t.customer_phone;
        return {
          key: t.id,
          ticketId: t.id,
          code: t.ticket_code,
          ticketType: t.ticket_type,
          customer: name,
          device: t.device_name,
          technician: t.technician?.name ?? null,
          detail: `Menunggu diambil ${days} hari`,
          days,
          urgency: urgencyOf("pickup", days),
          whatsapp: waLink(phone, readyForPickupText(name, t.ticket_code, path ? `${appUrl}${path}` : null)),
        };
      })
      .sort(byDays),
    vendor: vendor
      .map((c) => {
        const days = daysSince(c.sent_at as Date, now);
        return {
          key: c.id,
          ticketId: c.ticket.id,
          code: c.ticket.ticket_code,
          ticketType: c.ticket.ticket_type,
          customer: party(c.ticket),
          device: c.ticket.device_name,
          technician: c.ticket.technician?.name ?? null,
          detail: `${c.description} · ${c.vendor?.name ?? "vendor tidak dicatat"}`,
          days,
          urgency: urgencyOf("vendor", days),
        };
      })
      .sort(byDays),
    billing: billing
      .flatMap((t) => {
        const gap = billingGap(t.charges);
        if (!gap) return [];
        const days = daysSince(enteredStatusAt("done", t.status_logs, t.updated_at), now);
        return [
          {
            key: t.id,
            ticketId: t.id,
            code: t.ticket_code,
            ticketType: t.ticket_type,
            customer: party(t),
            device: t.device_name,
            technician: t.technician?.name ?? null,
            detail: gap,
            days,
            urgency: urgencyOf("billing", days),
          },
        ];
      })
      .sort(byDays),
    code: code
      .map((t) => {
        const days = daysSince(enteredStatusAt("done", t.status_logs, t.updated_at), now);
        const names = t.replaced_parts.map((p) => p.item_name?.trim() || p.part).join(", ");
        return {
          key: t.id,
          ticketId: t.id,
          code: t.ticket_code,
          ticketType: t.ticket_type,
          customer: party(t),
          device: t.device_name,
          technician: t.technician?.name ?? null,
          detail: `${t.replaced_parts.length} part: ${names}`,
          days,
          urgency: urgencyOf("code", days),
        };
      })
      .sort(byDays),
  };
}
