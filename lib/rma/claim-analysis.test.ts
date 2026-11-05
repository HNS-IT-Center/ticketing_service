import { describe, expect, it } from "vitest";
import { analyzeClaims, categoryKind, claimOutcome, UNKNOWN_KEY, type ClaimAnalysisRow } from "./claim-analysis";

const row = (over: Partial<ClaimAnalysisRow> = {}): ClaimAnalysisRow => ({
  device_brand: "ASUS",
  device_catalog_category: "LAPTOP ASUS",
  device_sku: "A1400KA",
  device_name: "NB ASUS VIVOBOOK 14",
  rma_case: { status: "closed", decision: "replaced" },
  ...over,
});

describe("claimOutcome", () => {
  it("tells the endings apart", () => {
    expect(claimOutcome(null)).toBe("not_handed_over");
    expect(claimOutcome({ status: "in_vendor_process", decision: null })).toBe("in_progress");
    expect(claimOutcome({ status: "closed", decision: "repaired" })).toBe("approved");
    expect(claimOutcome({ status: "closed", decision: "rejected" })).toBe("vendor_rejected");
    expect(claimOutcome({ status: "ineligible", decision: null })).toBe("ineligible");
    expect(claimOutcome({ status: "cancelled", decision: null })).toBe("cancelled");
  });
});

describe("categoryKind", () => {
  it("takes the make off the end of the category", () => {
    expect(categoryKind("VGA CARD MSI", "MSI")).toBe("VGA CARD");
    expect(categoryKind("laptop  asus", "Asus")).toBe("LAPTOP");
    expect(categoryKind("ACCESSORIES", "ASUS")).toBe("ACCESSORIES");
    expect(categoryKind(null, "ASUS")).toBeNull();
  });
});

describe("analyzeClaims", () => {
  const rows = [
    row(),
    row({ rma_case: { status: "closed", decision: "rejected" } }),
    row({ device_brand: "MSI", device_catalog_category: "VGA CARD MSI", device_sku: "100098", device_name: "VGA MSI RTX4060" }),
    row({ device_brand: null, device_catalog_category: null, device_sku: null, device_name: "Pc benzzera", rma_case: null }),
  ];
  const a = analyzeClaims(rows);

  it("counts by brand, most first, unknown last", () => {
    expect(a.total).toBe(4);
    expect(a.unknownBrand).toBe(1);
    expect(a.byBrand.map((r) => [r.label, r.total])).toEqual([
      ["ASUS", 2],
      ["MSI", 1],
      ["Tidak diketahui (diketik manual)", 1],
    ]);
    expect(a.byBrand.at(-1)?.key).toBe(UNKNOWN_KEY);
  });

  it("splits outcomes and rates approval over decided claims only", () => {
    const asus = a.byBrand[0];
    expect(asus.outcomes.approved).toBe(1);
    expect(asus.outcomes.vendor_rejected).toBe(1);
    expect(asus.approvalRate).toBe(0.5);
    expect(a.byBrand.at(-1)?.approvalRate).toBeNull();
  });

  it("groups kinds of goods without the make, and items by SKU", () => {
    expect(a.byCategory.map((r) => r.label)).toEqual(["LAPTOP", "VGA CARD", "Tidak diketahui (diketik manual)"]);
    expect(a.byItem.map((r) => [r.key, r.total])).toEqual([
      ["A1400KA", 2],
      ["100098", 1],
    ]);
  });
});
