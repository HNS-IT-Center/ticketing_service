/**
 * Who a ticket is for, as a list or detail page should name it.
 *
 * A store-stock warranty claim has no customer: since 2026-10-08 intake stores
 * no name for it rather than an invented one. `createTicketAction` refuses a
 * customer-owned claim without a name, so a claim with no customer name is
 * store stock by construction — which lets every list label it without joining
 * TicketWarrantyDetail.
 */
export const STORE_STOCK_LABEL = "Stok Toko";

export type TicketParty = {
  is_for_self: boolean;
  customer_name: string | null;
  ticket_type: string;
  user?: { name: string | null } | null;
};

export function isStoreStockClaim(t: TicketParty): boolean {
  return !t.is_for_self && t.ticket_type === "warranty_claim" && !t.customer_name?.trim();
}

/** The name to show, or null when there is none (callers pick their own fallback). */
export function ticketPartyName(t: TicketParty): string | null {
  if (t.is_for_self) return t.user?.name ?? null;
  if (isStoreStockClaim(t)) return STORE_STOCK_LABEL;
  return t.customer_name;
}
