import { describe, expect, it } from "vitest";
import { liveSearchHref } from "./live-search";
import { ticketSearchWhere } from "./ticket-list-filter";

describe("liveSearchHref", () => {
  it("keeps the other filters, drops the page and empty fields", () => {
    const fields: [string, string][] = [
      ["status", "rma_process"],
      ["q", " tuf "],
      ["page", "4"],
      ["actor", ""],
    ];
    expect(liveSearchHref("/rma/tickets", fields)).toBe("/rma/tickets?status=rma_process&q=tuf");
  });

  it("is the bare path when everything is empty", () => {
    expect(liveSearchHref("/admin/tickets", [["q", "   "]])).toBe("/admin/tickets");
  });
});

describe("ticketSearchWhere", () => {
  it("reaches the code, the customer, and the unit or parts by name, SKU or SN", () => {
    const where = JSON.stringify(ticketSearchWhere("  Asus TUF "));
    for (const f of ["ticket_code", "customer_name", "device_name", "device_sku", "device_sn", "replaced_parts", "item_name"]) {
      expect(where, f).toContain(f);
    }
    expect(where).toContain('"contains":"Asus TUF"');
  });

  it("is nothing for an empty box", () => {
    expect(ticketSearchWhere("  ")).toEqual({});
  });
});
