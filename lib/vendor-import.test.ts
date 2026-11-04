import { describe, expect, it } from "vitest";
import { cleanContact, planVendorImport, rolesForKind, type ExistingVendor } from "./vendor-import";
import { vendorLocationFromCode, vendorLocationText } from "./vendors";
import { VENDOR_LIST } from "../prisma/data/vendors";

const vendor = (over: Partial<ExistingVendor> & { name: string }): ExistingVendor => ({
  id: over.name,
  supplies_parts: false,
  repairs: false,
  handles_claims: false,
  location: null,
  contact: null,
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

describe("rolesForKind", () => {
  it("gives a claim vendor claims only, and a service centre claims plus external service", () => {
    expect(rolesForKind("claim")).toEqual({ supplies_parts: false, repairs: false, handles_claims: true });
    expect(rolesForKind("service_center")).toEqual({ supplies_parts: false, repairs: true, handles_claims: true });
    expect(rolesForKind("parts")).toEqual({ supplies_parts: true, repairs: false, handles_claims: false });
    expect(rolesForKind("external")).toEqual({ supplies_parts: false, repairs: true, handles_claims: false });
  });
});

describe("cleanContact", () => {
  it("writes a 62… number as +62…, and leaves e-mail and other numbers as given", () => {
    expect(cleanContact(" 6281927006000 ")).toBe("+6281927006000");
    expect(cleanContact("18030161224")).toBe("18030161224");
    expect(cleanContact("Admin.Rizal@metrodata.co.id")).toBe("Admin.Rizal@metrodata.co.id");
    expect(cleanContact("")).toBeNull();
    expect(cleanContact(undefined)).toBeNull();
  });
});

describe("planVendorImport", () => {
  it("creates what is missing with its roles, location and contact", () => {
    const plan = planVendorImport(
      [{ name: "  AGRES   BATAM ", location: "LKL", kind: "service_center", contact: "6281234314372" }],
      []
    );
    expect(plan.create).toEqual([
      {
        name: "AGRES BATAM",
        location: "in_town",
        contact: "+6281234314372",
        supplies_parts: false,
        repairs: true,
        handles_claims: true,
      },
    ]);
    expect(plan.update).toEqual([]);
  });

  it("matches an existing vendor regardless of case and keeps its spelling", () => {
    const plan = planVendorImport(
      [{ name: "ASUS SERVICE CENTER", location: "LKL", kind: "service_center" }],
      [vendor({ name: "Asus Service Center", handles_claims: true })]
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([
      expect.objectContaining({
        name: "Asus Service Center",
        data: { repairs: true, location: "in_town" },
      }),
    ]);
  });

  it("sets the roles exactly, taking away one the list does not name", () => {
    const plan = planVendorImport(
      [{ name: "GMS", location: "ITR", kind: "claim" }],
      [vendor({ name: "GMS", supplies_parts: true, handles_claims: true, location: "out_of_town" })]
    );
    expect(plan.update[0].data).toEqual({ supplies_parts: false });
    expect(plan.update[0].changes).toEqual(["peran − Supplier part"]);
  });

  it("only sends what changes, and nothing when already right", () => {
    const gms = vendor({ name: "GMS", handles_claims: true, location: "in_town", contact: "+6281927006000" });
    const line = { name: "GMS", location: "ITR", kind: "claim", contact: "6281927006000" } as const;
    const plan = planVendorImport([line], [gms]);
    expect(plan.update[0].data).toEqual({ location: "out_of_town" });
    expect(plan.update[0].changes).toEqual(["lokasi Dalam kota (LKL) → Luar kota (ITR)"]);

    const again = planVendorImport([line], [{ ...gms, location: "out_of_town" }]);
    expect(again.update).toEqual([]);
    expect(again.unchanged).toEqual(["GMS"]);
  });

  it("fills or replaces a contact, and leaves one the list does not give", () => {
    const filled = planVendorImport(
      [{ name: "SUN", location: "ITR", kind: "claim", contact: "6285260915174" }],
      [vendor({ name: "SUN", handles_claims: true, location: "out_of_town", contact: "lama" })]
    );
    expect(filled.update[0].data).toEqual({ contact: "+6285260915174" });

    const kept = planVendorImport(
      [{ name: "SNC", location: "LKL", kind: "parts" }],
      [vendor({ name: "SNC", supplies_parts: true, location: "in_town", contact: "0811" })]
    );
    expect(kept.unchanged).toEqual(["SNC"]);
  });

  it("renames a vendor entered under a former name instead of adding a second", () => {
    const plan = planVendorImport(
      [{ name: "DOVA (THERMALTAKE)", location: "ITR", kind: "claim", formerly: ["Dova"] }],
      [vendor({ name: "Dova", handles_claims: true, location: "out_of_town" })]
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([
      expect.objectContaining({ id: "Dova", name: "Dova", data: { name: "DOVA (THERMALTAKE)" } }),
    ]);
  });

  it("does not rename when the new name is already there, or the former name is still listed", () => {
    const both = planVendorImport(
      [{ name: "DOVA (THERMALTAKE)", location: "ITR", kind: "claim", formerly: ["Dova"] }],
      [vendor({ name: "Dova" }), vendor({ name: "Dova (Thermaltake)", handles_claims: true, location: "out_of_town" })]
    );
    expect(both.update).toEqual([]);
    expect(both.unchanged).toEqual(["Dova (Thermaltake)"]);

    const stillListed = planVendorImport(
      [
        { name: "NEW", location: "ITR", kind: "claim", formerly: ["OLD"] },
        { name: "OLD", location: "ITR", kind: "claim" },
      ],
      [vendor({ name: "OLD", handles_claims: true, location: "out_of_town" })]
    );
    expect(stillListed.create.map((v) => v.name)).toEqual(["NEW"]);
  });

  it("reports a deactivated vendor without reactivating it", () => {
    const plan = planVendorImport(
      [{ name: "KMN", location: "LKL", kind: "service_center" }],
      [vendor({ name: "KMN", is_active: false })]
    );
    expect(plan.inactive).toEqual(["KMN"]);
    expect(plan.update[0].data).not.toHaveProperty("is_active");
  });

  it("skips unreadable lines and a name listed twice", () => {
    const plan = planVendorImport(
      [
        { name: "SUN", location: "ITR", kind: "claim" },
        { name: "sun", location: "LKL", kind: "claim" },
        { name: "X", location: "ITR", kind: "claim" },
        { name: "Dova", location: "JKT" as "ITR", kind: "claim" },
      ],
      []
    );
    expect(plan.create.map((v) => v.name)).toEqual(["SUN"]);
    expect(plan.invalid).toHaveLength(2);
  });
});

describe("the shop's list", () => {
  it("is readable in full, with no name twice", () => {
    const plan = planVendorImport(VENDOR_LIST, []);
    expect(plan.invalid).toEqual([]);
    expect(plan.create).toHaveLength(VENDOR_LIST.length);
  });
});
