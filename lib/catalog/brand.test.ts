import { describe, expect, it } from "vitest";
import { catalogBrand } from "./brand";

describe("catalogBrand", () => {
  it("takes Accurate's brand when it has one", () => {
    expect(catalogBrand({ brand: "Asus", category: "LAPTOP ASUS" })).toBe("ASUS");
  });

  it("falls back on the make the category is named after", () => {
    expect(catalogBrand({ brand: null, category: "VGA CARD MSI" })).toBe("MSI");
    expect(catalogBrand({ brand: "  ", category: "MB ASUS" })).toBe("ASUS");
  });

  it("is nothing when neither says", () => {
    expect(catalogBrand({ brand: null, category: "ACCESSORIES" })).toBeNull();
    expect(catalogBrand({ brand: null, category: null })).toBeNull();
  });
});
