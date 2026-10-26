import { describe, expect, it } from "vitest";
import { stockAtStore, toCatalogItem } from "./items";
import { currentMonth, monthRange, summarizeParts, type PartReportRow } from "../reports/parts";

// The shape data.hnsitcenter.id returns, as observed on 2026-10-19.
const apiItem = {
  id: 7311,
  sku: "2505000019",
  name: "NEW LCD LAPTOP ASUS VIVOBOOOK A1400E 14 INCH",
  barcode: null,
  type: "INVENTORY",
  unit: "PCS",
  category: { id: 210, name: "SPAREPART SERVICE" },
  brand: null,
  status: "active",
  manageSerialNumber: false,
  price: 0,
  stock: {
    total: 3,
    availableToSell: 3,
    warehouses: [
      { id: 400, name: "NAGOYAHILL", quantity: 2, countsInTotal: true },
      { id: 401, name: "NAGOYA WIKA", quantity: 1, countsInTotal: true },
    ],
  },
};

describe("toCatalogItem", () => {
  it("keeps what a part record needs", () => {
    expect(toCatalogItem(apiItem)).toEqual({
      id: 7311,
      sku: "2505000019",
      name: "NEW LCD LAPTOP ASUS VIVOBOOOK A1400E 14 INCH",
      category: "SPAREPART SERVICE",
      brand: null,
      type: "INVENTORY",
      unit: "PCS",
      serialized: false,
      stockTotal: 3,
      warehouses: [
        { name: "NAGOYAHILL", quantity: 2 },
        { name: "NAGOYA WIKA", quantity: 1 },
      ],
    });
  });

  it("drops an item with no id, SKU or name", () => {
    expect(toCatalogItem({ ...apiItem, sku: null })).toBeNull();
    expect(toCatalogItem({ ...apiItem, id: "7311" })).toBeNull();
    expect(toCatalogItem({ ...apiItem, name: "  " })).toBeNull();
  });
});

describe("stockAtStore", () => {
  const item = toCatalogItem(apiItem)!;
  it("matches a store to its warehouse whatever the spacing and case", () => {
    expect(stockAtStore(item, "Nagoya Hill")).toBe(2);
    expect(stockAtStore(item, "nagoya wika")).toBe(1);
  });
  it("says nothing for a store with no warehouse", () => {
    expect(stockAtStore(item, "Batam Center")).toBeNull();
    expect(stockAtStore(item, null)).toBeNull();
  });
});

describe("monthRange", () => {
  it("starts and ends at WIB midnight", () => {
    expect(monthRange("2026-10")).toEqual({
      start: new Date("2026-09-30T17:00:00.000Z"),
      end: new Date("2026-10-31T17:00:00.000Z"),
    });
  });
  it.each(["2026-13", "26-10", "2026-1", "", "abc"])("refuses %j", (m) => {
    expect(monthRange(m)).toBeNull();
  });
  it("puts 00:30 WIB on the 1st in the new month", () => {
    expect(currentMonth(Date.parse("2026-10-31T17:30:00.000Z"))).toBe("2026-11");
  });
});

describe("summarizeParts", () => {
  const row = (o: Partial<PartReportRow>): PartReportRow => ({
    id: Math.random().toString(36),
    createdAt: new Date(),
    part: "battery",
    itemName: null,
    sku: null,
    catalogCategory: null,
    quantity: 1,
    notes: null,
    ticketId: "t1",
    ticketCode: "NGH-000001",
    storeName: "Nagoya Hill",
    technicianName: "Dennis",
    ...o,
  });

  it("counts quantities, groups by SKU, and by typed name ignoring case", () => {
    const s = summarizeParts([
      row({ sku: "A1", itemName: "Baterai ASUS", quantity: 2, ticketId: "t1" }),
      row({ sku: "A1", itemName: "Baterai ASUS", quantity: 1, ticketId: "t2" }),
      row({ itemName: "baterai generik", ticketId: "t3" }),
      row({ itemName: "Baterai Generik", ticketId: "t3", technicianName: "Rafael" }),
      row({ part: "lcd", itemName: "LCD", quantity: 1, ticketId: "t4", technicianName: "Rafael" }),
    ]);
    expect(s).toMatchObject({ entries: 5, quantity: 6, tickets: 4, fromCatalog: 2 });
    expect(s.byPart).toEqual([
      { part: "battery", quantity: 5, entries: 4 },
      { part: "lcd", quantity: 1, entries: 1 },
    ]);
    expect(s.byItem[0]).toMatchObject({ sku: "A1", quantity: 3, tickets: 2 });
    expect(s.byItem.find((i) => i.label.toLowerCase() === "baterai generik")).toMatchObject({ quantity: 2, tickets: 1 });
    expect(s.byTechnician).toEqual([
      { name: "Dennis", quantity: 4, entries: 3 },
      { name: "Rafael", quantity: 2, entries: 2 },
    ]);
  });
});
