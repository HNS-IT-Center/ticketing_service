import { describe, expect, it } from "vitest";
import { planVendorImport, type ExistingVendor } from "./vendor-import";
import { vendorLocationFromCode, vendorLocationText } from "./vendors";
import { CLAIM_VENDORS } from "../prisma/data/claim-vendors";

const vendor = (over: Partial<ExistingVendor> & { name: string }): ExistingVendor => ({
  id: over.name,
  handles_claims: false,
  location: null,
  is_active: true,
  ...over,
});

describe("vendor location codes", () => {
  it("reads the supplier list's codes in any case, and nothing else", () => {
    expect(vendorLocationFromCode("LKL")).toBe("in_town");
    expect(vendorLocationFromCode(" itr ")).toBe("out_of_town");
    expect(vendorLocationFromCode("JKT")).toBeNull();
    expect(vendorLocationText("out_of_town")).toBe("Luar kota (ITR)");
    expect(vendorLocationText(null)).toBeNull();
  });
});

describe("planVendorImport", () => {
  it("creates what is missing as a claim vendor with its location", () => {
    const plan = planVendorImport([{ name: "  AGRES   BATAM ", location: "LKL" }], []);
    expect(plan.create).toEqual([{ name: "AGRES BATAM", location: "in_town" }]);
    expect(plan.update).toEqual([]);
  });

  it("matches an existing vendor regardless of case and keeps its spelling", () => {
    const plan = planVendorImport(
      [{ name: "ASUS SERVICE CENTER", location: "LKL" }],
      [vendor({ name: "Asus Service Center" })]
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([
      expect.objectContaining({
        name: "Asus Service Center",
        data: { handles_claims: true, location: "in_town" },
      }),
    ]);
  });

  it("only sends what changes, and nothing when already right", () => {
    const supplier = vendor({ name: "GMS", handles_claims: true, location: "in_town" });
    const plan = planVendorImport([{ name: "GMS", location: "ITR" }], [supplier]);
    expect(plan.update[0].data).toEqual({ location: "out_of_town" });
    expect(plan.update[0].changes).toEqual(["lokasi Dalam kota (LKL) → Luar kota (ITR)"]);

    const again = planVendorImport([{ name: "GMS", location: "ITR" }], [{ ...supplier, location: "out_of_town" }]);
    expect(again.update).toEqual([]);
    expect(again.unchanged).toEqual(["GMS"]);
  });

  it("reports a deactivated vendor without reactivating it", () => {
    const plan = planVendorImport([{ name: "KMN", location: "LKL" }], [vendor({ name: "KMN", is_active: false })]);
    expect(plan.inactive).toEqual(["KMN"]);
    expect(plan.update[0].data).not.toHaveProperty("is_active");
  });

  it("skips unreadable lines and a name listed twice", () => {
    const plan = planVendorImport(
      [
        { name: "SUN", location: "ITR" },
        { name: "sun", location: "LKL" },
        { name: "X", location: "ITR" },
        { name: "Dova", location: "JKT" },
      ],
      []
    );
    expect(plan.create).toEqual([{ name: "SUN", location: "out_of_town" }]);
    expect(plan.invalid).toHaveLength(2);
  });
});

describe("the shop's list", () => {
  it("is readable in full, with no name twice", () => {
    const plan = planVendorImport(CLAIM_VENDORS, []);
    expect(plan.invalid).toEqual([]);
    expect(plan.create).toHaveLength(CLAIM_VENDORS.length);
  });
});
