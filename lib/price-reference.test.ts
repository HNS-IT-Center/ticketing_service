import { describe, it, expect } from "vitest";
import { nameKey, priceReference, REFERENCE_SAMPLES, type PriceSample } from "./price-reference";

let n = 0;
const sale = (o: Partial<PriceSample>): PriceSample => ({
  chargeId: `c${++n}`,
  part: "battery",
  sku: null,
  name: null,
  price: 500000,
  at: new Date(Date.UTC(2026, 9, n)),
  ...o,
});

describe("priceReference", () => {
  it("prefers the same catalogue item, and summarises its recent prices", () => {
    const samples = [
      sale({ sku: "BAT-1", price: 450000, at: new Date("2026-09-01T03:00:00Z") }),
      sale({ sku: "BAT-1", price: 550000, at: new Date("2026-10-01T03:00:00Z") }),
      sale({ sku: "BAT-1", price: 500000, at: new Date("2026-10-10T03:00:00Z") }),
      sale({ sku: "BAT-2", price: 900000 }),
    ];
    const ref = priceReference({ chargeId: "me", part: "battery", sku: "BAT-1", name: "x" }, samples)!;
    expect(ref).toMatchObject({ basis: "sku", count: 3, min: 450000, max: 550000, median: 500000, last: 500000 });
    expect(ref.lastAt).toBe("2026-10-10T03:00:00.000Z");
  });

  it("matches a typed part by its name in the same category, case and spacing ignored", () => {
    const samples = [
      sale({ name: "Baterai KW 6 cell", price: 300000 }),
      sale({ name: "baterai  kw 6 CELL", price: 350000 }),
      sale({ name: "Baterai KW 6 cell", part: "other", price: 999999 }),
      sale({ sku: "BAT-1", name: "Baterai KW 6 cell", price: 777777 }),
    ];
    const ref = priceReference({ chargeId: "me", part: "battery", sku: null, name: "BATERAI KW 6 CELL" }, samples)!;
    expect(ref).toMatchObject({ basis: "name", count: 2, min: 300000, max: 350000, median: 325000 });
  });

  it("falls back to the whole category only with enough sales", () => {
    const two = [sale({ sku: "A", price: 400000 }), sale({ sku: "B", price: 600000 })];
    expect(priceReference({ chargeId: "me", part: "battery", sku: "Z", name: null }, two)).toBeNull();
    const three = [...two, sale({ sku: "C", price: 500000 })];
    expect(priceReference({ chargeId: "me", part: "battery", sku: "Z", name: null }, three)).toMatchObject({
      basis: "category",
      label: "semua Baterai",
      count: 3,
      median: 500000,
    });
  });

  it("never counts the line itself, and reads only the most recent sales", () => {
    const many = Array.from({ length: REFERENCE_SAMPLES + 5 }, (_, i) =>
      sale({ sku: "BAT-1", price: 100000 + i * 1000, at: new Date(Date.UTC(2026, 0, i + 1)) })
    );
    const self = many[many.length - 1];
    const ref = priceReference({ chargeId: self.chargeId, part: "battery", sku: "BAT-1", name: null }, many)!;
    expect(ref.count).toBe(REFERENCE_SAMPLES);
    expect(ref.last).toBe(many[many.length - 2].price);
  });

  it("has nothing to say about a part never sold before", () => {
    expect(priceReference({ chargeId: "me", part: "lcd", sku: "LCD-1", name: "LCD" }, [sale({})])).toBeNull();
  });
});

describe("nameKey", () => {
  it("folds case and spacing, and treats blank as no name", () => {
    expect(nameKey("  Baterai   KW ")).toBe("baterai kw");
    expect(nameKey("   ")).toBeNull();
    expect(nameKey(null)).toBeNull();
  });
});
