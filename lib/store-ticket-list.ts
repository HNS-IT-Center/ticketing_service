import type { Prisma, TicketType } from "@prisma/client";
import { ticketListWhere, ticketSearchWhere } from "@/lib/ticket-list-filter";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";

/**
 * The kepala toko's Tiket Toko list — which tickets it shows — one copy, read
 * by the page and by its spreadsheet export so the file holds what is listed.
 *
 * Every part is combined with AND: the chip, the search and the technician
 * filter can each name the same field (the "Unassigned" chip and a technician
 * both set technician_id; the search is an OR), and object spread would let
 * one silently overwrite another.
 */
export type StoreTicketFilter = {
  storeIds: string[];
  status: string;
  query: string;
  technicianId?: string;
  type?: string;
};

export const STORE_TICKET_TYPES = Object.keys(TICKET_TYPE_LABELS) as TicketType[];

function isTicketType(v: string | undefined): v is TicketType {
  return Boolean(v) && (STORE_TICKET_TYPES as string[]).includes(v as string);
}

export function storeTicketWhere(f: StoreTicketFilter): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [{ store_location_id: { in: f.storeIds } }];
  const chip = ticketListWhere(f.status);
  if (Object.keys(chip).length) and.push(chip);
  const search = ticketSearchWhere(f.query);
  if (Object.keys(search).length) and.push(search);
  if (f.technicianId) and.push({ technician_id: f.technicianId });
  if (isTicketType(f.type)) and.push({ ticket_type: f.type });
  return { AND: and };
}
