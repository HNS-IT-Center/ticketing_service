import { describe, it, expect } from "vitest";
import { cleanVendorName, vendorKey } from "./vendor";

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
