import { describe, it, expect } from "vitest";
import { ticketPartyName, isStoreStockClaim, STORE_STOCK_LABEL } from "./ticket-party";

const base = { is_for_self: false, customer_name: "JEJU", ticket_type: "warranty_claim", user: { name: "Staff" } };

describe("ticketPartyName", () => {
  it("names the customer of an ordinary ticket", () => {
    expect(ticketPartyName(base)).toBe("JEJU");
  });

  it("labels a warranty claim with no customer as store stock", () => {
    expect(ticketPartyName({ ...base, customer_name: null })).toBe(STORE_STOCK_LABEL);
    expect(ticketPartyName({ ...base, customer_name: "  " })).toBe(STORE_STOCK_LABEL);
  });

  it("does not call any other nameless ticket store stock", () => {
    const t = { ...base, ticket_type: "service", customer_name: null };
    expect(isStoreStockClaim(t)).toBe(false);
    expect(ticketPartyName(t)).toBeNull();
  });

  it("uses the account owner for a ticket raised for oneself", () => {
    expect(ticketPartyName({ ...base, is_for_self: true, customer_name: null })).toBe("Staff");
  });
});
