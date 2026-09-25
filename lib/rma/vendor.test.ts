import { describe, it, expect } from "vitest";
import { canonicalVendorName, cleanVendorName, vendorKey } from "./vendor";

describe("cleanVendorName", () => {
  it("trims the ends and collapses runs of whitespace", () => {
    expect(cleanVendorName("  Asus   Service  Center ")).toBe("Asus Service Center");
    expect(cleanVendorName("MSI\tIndonesia")).toBe("MSI Indonesia");
    expect(cleanVendorName("A\n\nB")).toBe("A B");
  });

  it("returns an empty string for whitespace only", () => {
    expect(cleanVendorName("   ")).toBe("");
    expect(cleanVendorName("")).toBe("");
  });
});

describe("vendorKey", () => {
  it("treats case and spacing as the same vendor", () => {
    // The two spellings that were actually in the live data.
    expect(vendorKey("Asus Service Center")).toBe(vendorKey("ASUS SERVICE CENTER"));
    expect(vendorKey(" asus  service center ")).toBe(vendorKey("Asus Service Center"));
  });

  it("keeps genuinely different vendors apart", () => {
    expect(vendorKey("Asus Service Center")).not.toBe(vendorKey("MSI Indonesia"));
    expect(vendorKey("Asus")).not.toBe(vendorKey("Asus Service Center"));
  });
});

describe("canonicalVendorName", () => {
  const known = ["Asus Service Center", "MSI Indonesia"];

  it("folds a differently-cased entry onto the spelling already in use", () => {
    expect(canonicalVendorName("ASUS SERVICE CENTER", known)).toBe("Asus Service Center");
    expect(canonicalVendorName("asus service center", known)).toBe("Asus Service Center");
  });

  it("folds sloppy spacing too", () => {
    expect(canonicalVendorName("  Asus   Service Center  ", known)).toBe("Asus Service Center");
  });

  it("keeps a genuinely new vendor's own capitalisation", () => {
    // Imposing Title Case here would turn "iBox" into "Ibox".
    expect(canonicalVendorName("iBox", known)).toBe("iBox");
    expect(canonicalVendorName("PT. Datascrip", known)).toBe("PT. Datascrip");
  });

  it("still cleans a new vendor's spacing", () => {
    expect(canonicalVendorName("  Lenovo   Care ", known)).toBe("Lenovo Care");
  });

  it("returns empty for blank input, so the caller can store null", () => {
    expect(canonicalVendorName("   ", known)).toBe("");
    expect(canonicalVendorName("", [])).toBe("");
  });

  it("copes with no known vendors at all", () => {
    expect(canonicalVendorName("Asus Service Center", [])).toBe("Asus Service Center");
  });

  it("normalises the stored spelling it matched against", () => {
    // A known entry that itself has sloppy spacing should not propagate it.
    expect(canonicalVendorName("asus service center", ["Asus   Service Center"])).toBe(
      "Asus Service Center",
    );
  });

  it("is idempotent", () => {
    const once = canonicalVendorName("ASUS SERVICE CENTER", known);
    expect(canonicalVendorName(once, known)).toBe(once);
  });
});
