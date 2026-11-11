import { describe, expect, it } from "vitest";
import { decisionDays, heldMoney, heldMoneyByVendor, speedOf, vendorKeyOf, vendorRows, vendorSpan, type VendorClaim } from "./finance-claims";
import { stageOfClaim } from "./finance-filter";

const NOW = Date.parse("2026-11-10T05:00:00Z");
const day = (n: number) => new Date(NOW - n * 24 * 3600_000);

const claim = (over: Partial<VendorClaim>): VendorClaim => ({
  vendorKey: "v1",
  vendorName: "Asus Service Center",
  decision: null,
  status: "in_vendor_process",
  submittedAt: null,
  decidedAt: null,
  receivedAt: null,
  closedAt: null,
  ...over,
});

describe("vendorSpan", () => {
  it("runs from sending to the unit coming back, else to today", () => {
    expect(vendorSpan(claim({ submittedAt: day(20), receivedAt: day(5) }), NOW)).toEqual({ days: 15, open: false });
    expect(vendorSpan(claim({ submittedAt: day(20) }), NOW)).toEqual({ days: 20, open: true });
    expect(vendorSpan(claim({ submittedAt: day(20), closedAt: day(2) }), NOW)).toEqual({ days: 18, open: false });
    expect(vendorSpan(claim({}), NOW)).toBeNull();
  });

  it("counts the decision separately", () => {
    expect(decisionDays(claim({ submittedAt: day(20), decidedAt: day(12) }))).toBe(8);
    expect(decisionDays(claim({ submittedAt: day(20) }))).toBeNull();
  });
});

describe("vendorRows", () => {
  it("puts the slowest vendor first and counts what is still out", () => {
    const rows = vendorRows(
      [
        claim({ vendorKey: "fast", vendorName: "Cepat", submittedAt: day(10), receivedAt: day(7), decision: "replaced" }),
        claim({ vendorKey: "fast", vendorName: "Cepat", submittedAt: day(9), receivedAt: day(4), decision: "rejected" }),
        claim({ vendorKey: "slow", vendorName: "Lambat", submittedAt: day(40) }),
        claim({ vendorKey: "slow", vendorName: "Lambat", submittedAt: day(50), receivedAt: day(10), decision: "repaired" }),
        claim({ vendorKey: "none", vendorName: "Tidak dikirim" }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(["slow", "fast"]);
    expect(rows[0]).toMatchObject({ sent: 2, open: 1, openSlow: 1, longestOpen: 40, medianReturn: 40, approved: 1 });
    expect(rows[1]).toMatchObject({ sent: 2, open: 0, medianReturn: 4, avgReturn: 4, approved: 1, rejected: 1 });
  });
});

describe("speed and keys", () => {
  it("colours 14 days as slow and 30 as very slow", () => {
    expect([speedOf(13), speedOf(14), speedOf(30)]).toEqual(["ok", "slow", "very_slow"]);
  });

  it("joins a vendor typed with other spacing or case, and prefers the linked id", () => {
    expect(vendorKeyOf(null, "  ASUS  Service Center ")).toBe(vendorKeyOf(null, "asus service center"));
    expect(vendorKeyOf("id1", "Anything")).toBe("id1");
    expect(vendorKeyOf(null, null)).toBe("none");
  });

  it("places a claim: at the vendor, back, or not sent yet", () => {
    expect(stageOfClaim({ span: { days: 3, open: true }, rmaStatus: "in_vendor_process" })).toBe("at_vendor");
    expect(stageOfClaim({ span: { days: 3, open: false }, rmaStatus: "closed" })).toBe("back");
    expect(stageOfClaim({ span: null, rmaStatus: "verified" })).toBe("not_sent");
    expect(stageOfClaim({ span: null, rmaStatus: null })).toBe("not_sent");
    expect(stageOfClaim({ span: null, rmaStatus: "ineligible" })).toBe("back");
  });
});

describe("heldMoney", () => {
  it("adds harga modal per unit and counts an unpriced unit apart, never as zero", () => {
    expect(heldMoney([{ unitCost: 4_500_000 }, { unitCost: 1_200_000 }, { unitCost: null }])).toEqual({ value: 5_700_000, units: 3, unpriced: 1 });
    expect(heldMoney([])).toEqual({ value: 0, units: 0, unpriced: 0 });
  });

  it("groups by vendor", () => {
    const byVendor = heldMoneyByVendor([
      { vendorKey: "a", unitCost: 1000 },
      { vendorKey: "a", unitCost: 2000 },
      { vendorKey: "b", unitCost: null },
    ]);
    expect(byVendor.get("a")).toEqual({ value: 3000, units: 2, unpriced: 0 });
    expect(byVendor.get("b")).toEqual({ value: 0, units: 1, unpriced: 1 });
  });
});
