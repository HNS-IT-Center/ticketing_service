import { describe, it, expect } from "vitest";
import type { ChargeKind, TicketStatus } from "@prisma/client";
import {
  ADDABLE_CHARGE_KINDS,
  chargeKindLabel,
  externalState,
  groupDigits,
  mayEditCharges,
  mayLinkPartCode,
  parseRupiah,
  partChargeDescription,
  summarizeCharges,
  vendorFitsCharge,
} from "./charges";
import type { Audience } from "./access";

describe("parseRupiah", () => {
  it.each([
    ["150000", 150000],
    ["150.000", 150000],
    ["Rp 150.000", 150000],
    ["Rp. 1.250.000,00", 1250000],
    ["  75 000 ", 75000],
    ["0", 0],
  ])("reads %j as %d", (raw, value) => {
    expect(parseRupiah(raw)).toEqual({ ok: true, value });
  });

  it("reads empty as not filled in, which is not zero", () => {
    expect(parseRupiah("")).toEqual({ ok: true, value: null });
    expect(parseRupiah("   ")).toEqual({ ok: true, value: null });
    expect(parseRupiah(null)).toEqual({ ok: true, value: null });
  });

  it.each(["abc", "1,5", "-100", "150k", "1000000000"])("refuses %j", (raw) => {
    expect(parseRupiah(raw)).toEqual({ ok: false });
  });
});

describe("groupDigits", () => {
  it("groups the Indonesian way and drops what is not a digit", () => {
    expect(groupDigits("1500000")).toBe("1.500.000");
    expect(groupDigits("Rp 1.500")).toBe("1.500");
    expect(groupDigits("00150")).toBe("150");
    expect(groupDigits("0")).toBe("0");
    expect(groupDigits("abc")).toBe("");
  });

  it("round-trips through parseRupiah", () => {
    expect(parseRupiah(groupDigits("987654321"))).toEqual({ ok: true, value: 987654321 });
  });
});

describe("summarizeCharges", () => {
  const line = (kind: ChargeKind, quantity: number, unit_price: number | null, unit_cost?: number | null) => ({
    kind,
    quantity,
    unit_price,
    unit_cost,
  });

  it("adds price × quantity, and counts what is still empty", () => {
    const s = summarizeCharges([
      line("part", 2, 300_000, 200_000),
      line("external_service", 1, 500_000, null),
      line("service_fee", 1, 150_000, null),
      line("other", 1, null, 10_000),
    ]);
    expect(s.total).toBe(600_000 + 500_000 + 150_000);
    expect(s.unpriced).toBe(1);
    expect(s.cost).toBe(400_000 + 10_000);
    // The shop's own labour is not bought in: no cost there is not a gap.
    expect(s.uncosted).toBe(1);
    expect(s.margin).toBe(s.total - s.cost);
    expect(s.complete).toBe(false);
  });

  it("is complete when every price and every bought-in cost is there", () => {
    const s = summarizeCharges([line("part", 1, 100, 60), line("service_fee", 1, 50, null)]);
    expect(s).toMatchObject({ total: 150, cost: 60, margin: 90, unpriced: 0, uncosted: 0, complete: true });
  });

  it("does not count hidden costs as missing", () => {
    const s = summarizeCharges([line("part", 1, 100)]);
    expect(s).toMatchObject({ cost: 0, uncosted: 0 });
  });

  it("treats a price of 0 as filled in", () => {
    expect(summarizeCharges([line("part", 1, 0, 0)])).toMatchObject({ unpriced: 0, complete: true });
  });
});

describe("mayEditCharges", () => {
  const ticket = (over: Partial<{ technician_id: string | null; sales_id: string | null; store_location_id: string | null; status: TicketStatus }> = {}) => ({
    technician_id: "tech",
    sales_id: "sales",
    store_location_id: "storeA",
    status: "on_progress" as TicketStatus,
    ...over,
  });
  const may = (userId: string, audiences: Audience[], t = ticket(), stores: string[] = []) =>
    mayEditCharges({ userId, audiences, coordinatorStoreIds: stores, ticket: t });

  it("lets the technician holding the ticket edit until it is closed", () => {
    expect(may("tech", ["technician"])).toBe(true);
    expect(may("tech", ["technician"], ticket({ status: "done" }))).toBe(true);
    for (const status of ["completed", "cancelled", "rejected"] as const) {
      expect(may("tech", ["technician"], ticket({ status }))).toBe(false);
    }
  });

  it("refuses a technician who does not hold the ticket", () => {
    expect(may("other", ["technician"])).toBe(false);
  });

  it("lets the assigned sales edit, and no other sales", () => {
    expect(may("sales", ["sales"])).toBe(true);
    expect(may("sales2", ["sales"])).toBe(false);
  });

  it("lets a coordinator edit their own stores at any status, and only those", () => {
    expect(may("c", ["technician", "coordinator"], ticket({ status: "completed" }), ["storeA"])).toBe(true);
    expect(may("c", ["technician", "coordinator"], ticket(), ["storeB"])).toBe(false);
    // A ticket with no store belongs to no store, so every coordinator keeps it.
    expect(may("c", ["technician", "coordinator"], ticket({ store_location_id: null }), ["storeB"])).toBe(true);
  });

  it("lets an administrator and a head technician edit anything", () => {
    expect(may("a", ["administrator"], ticket({ status: "completed" }))).toBe(true);
    expect(may("h", ["technician", "head_technician"], ticket({ status: "cancelled" }))).toBe(true);
  });

  it("refuses RMA and anyone with no group", () => {
    expect(may("r", ["rma"])).toBe(false);
    expect(may("x", [])).toBe(false);
  });

  describe("mayLinkPartCode", () => {
    const link = (userId: string, audiences: Audience[], t = ticket()) =>
      mayLinkPartCode({ userId, audiences, coordinatorStoreIds: [], ticket: t });

    it("lets the holding technician add a code after the ticket is closed — receiving lags", () => {
      for (const status of ["completed", "cancelled", "rejected"] as const) {
        expect(link("tech", ["technician"], ticket({ status }))).toBe(true);
      }
    });

    it("follows the bill otherwise: sales until closed, nobody else", () => {
      expect(link("sales", ["sales"])).toBe(true);
      expect(link("sales", ["sales"], ticket({ status: "completed" }))).toBe(false);
      expect(link("other", ["technician"])).toBe(false);
      expect(link("r", ["rma"])).toBe(false);
    });
  });
});

describe("labels and small rules", () => {
  it("labels every kind, and a part is never added by hand", () => {
    for (const kind of ["part", "external_service", "service_fee", "other"] as const) {
      expect(chargeKindLabel(kind)).not.toBe(kind);
    }
    expect(ADDABLE_CHARGE_KINDS).not.toContain("part");
  });

  it("names a part line after the item, else the category", () => {
    expect(partChargeDescription("battery", "  ASUS C31N1915 ")).toBe("ASUS C31N1915");
    expect(partChargeDescription("battery", "")).toBe("Baterai");
    expect(partChargeDescription("fan", null)).toBe("Kipas / Pendingin");
  });

  it("knows where external work stands", () => {
    expect(externalState({ kind: "external_service", sent_at: "x", returned_at: null })).toBe("at_vendor");
    expect(externalState({ kind: "external_service", sent_at: "x", returned_at: "y" })).toBe("returned");
    expect(externalState({ kind: "part", sent_at: null, returned_at: null })).toBeNull();
  });

  it("matches vendors to lines by their roles", () => {
    const parts = { supplies_parts: true, repairs: false };
    const repairer = { supplies_parts: false, repairs: true };
    const both = { supplies_parts: true, repairs: true };
    const claimsOnly = { supplies_parts: false, repairs: false };
    expect(vendorFitsCharge("external_service", repairer)).toBe(true);
    expect(vendorFitsCharge("external_service", parts)).toBe(false);
    expect(vendorFitsCharge("part", parts)).toBe(true);
    expect(vendorFitsCharge("part", repairer)).toBe(false);
    expect(vendorFitsCharge("part", both)).toBe(true);
    expect(vendorFitsCharge("other", repairer)).toBe(true);
    // Only taking warranty claims is not a reason to be on a service bill.
    for (const kind of ["part", "external_service", "other", "service_fee"] as const) {
      expect(vendorFitsCharge(kind, claimsOnly)).toBe(false);
    }
    // The shop's own labour has no vendor.
    expect(vendorFitsCharge("service_fee", both)).toBe(false);
  });
});
