import { describe, expect, it } from "vitest";
import { CLAIM_WAREHOUSE_IDS, STOCK_WAREHOUSE_IDS, stockAtStore, toCatalogItem } from "./items";
import { currentMonth, monthRange, summarizeParts, type PartReportRow } from "../reports/parts";

// A real answer from data.hnsitcenter.id, 2026-10-26, for a client that is
// given every warehouse, plus one display row. GRIYA holds 88 of `stock.total`.
const apiItem = {
  id: 7311,
  sku: "2503000069",
  name: "NEW BACKPACK LENOVO BP210 15.6 GREY",
  barcode: null,
  type: "INVENTORY",
  unit: "PCS",
  category: { id: 210, name: "AKSESSORIES" },
  brand: null,
  status: "active",
  manageSerialNumber: false,
  price: 0,
  stock: {
    total: 172,
    availableToSell: 172,
    warehouses: [
      { id: 250, name: "GATEWAY", quantity: 24, countsInTotal: true },
      { id: 350, name: "GRIYA", quantity: 88, countsInTotal: true },
      { id: 50, name: "GUDANG UTAMA", quantity: 29, countsInTotal: true },
      { id: 150, name: "INVENTARIS NAGOYA GATEWAY", quantity: 1, countsInTotal: true },
      { id: 450, name: "KLAIM GARANSI", quantity: 1, countsInTotal: false },
      { id: 400, name: "NAGOYAHILL", quantity: 27, countsInTotal: true },
      { id: 2250, name: "GUDANG DISPLAY NAGOYAHILL", quantity: 3, countsInTotal: true },
      { id: 200, name: "Transit (AOL System)", quantity: 43, countsInTotal: false },
    ],
  },
};

describe("toCatalogItem", () => {
  it("keeps what a part record needs, and only the warehouses this app reads", () => {
    expect(toCatalogItem(apiItem)).toEqual({
      id: 7311,
      sku: "2503000069",
      name: "NEW BACKPACK LENOVO BP210 15.6 GREY",
      category: "AKSESSORIES",
      brand: null,
      type: "INVENTORY",
      unit: "PCS",
      serialized: false,
      stockTotal: 80,
      warehouses: [
        { id: 250, name: "GATEWAY", quantity: 24 },
        { id: 50, name: "GUDANG UTAMA", quantity: 29 },
        { id: 400, name: "NAGOYAHILL", quantity: 27 },
      ],
      claimWarehouses: [{ id: 450, name: "KLAIM GARANSI", quantity: 1 }],
    });
  });

  it("keeps claim stock apart: out of the total, the store figures and the store list", () => {
    const item = toCatalogItem(apiItem)!;
    expect(CLAIM_WAREHOUSE_IDS.has(350)).toBe(false);
    expect(item.warehouses.some((w) => CLAIM_WAREHOUSE_IDS.has(w.id))).toBe(false);
    expect(item.claimWarehouses.map((w) => w.id)).toEqual([450]);
  });

  it("takes KLAIM PEMASOK by name the day it appears, under any id but Griya's", () => {
    const item = toCatalogItem({
      ...apiItem,
      stock: {
        total: 0,
        warehouses: [
          { id: 450, name: "KLAIM GARANSI", quantity: 1, countsInTotal: false },
          { id: 9001, name: "Klaim  Pemasok", quantity: 2, countsInTotal: false },
          { id: 350, name: "KLAIM PEMASOK", quantity: 7, countsInTotal: true },
        ],
      },
    })!;
    expect(item.claimWarehouses).toEqual([
      { id: 450, name: "KLAIM GARANSI", quantity: 1 },
      { id: 9001, name: "Klaim  Pemasok", quantity: 2 },
    ]);
    expect(item.warehouses).toEqual([]);
    expect(item.stockTotal).toBe(0);
  });

  it("never lets Griya through — not as a row, a name, or a share of the total", () => {
    expect(STOCK_WAREHOUSE_IDS.has(350)).toBe(false);
    const item = toCatalogItem(apiItem)!;
    expect(JSON.stringify(item)).not.toMatch(/griya|350/i);
    // 172 from the API, less GRIYA's 88, display's 3 and inventaris' 1.
    expect(item.stockTotal).toBe(172 - 88 - 3 - 1);
  });

  it("drops a warehouse row whose id is missing or not a number", () => {
    const item = toCatalogItem({
      ...apiItem,
      stock: {
        total: 9,
        warehouses: [
          { id: "350", name: "GRIYA", quantity: 5, countsInTotal: true },
          { name: "GATEWAY", quantity: 4, countsInTotal: true },
        ],
      },
    })!;
    expect(item.warehouses).toEqual([]);
    expect(item.stockTotal).toBe(0);
  });

  it("drops an item with no id, SKU or name", () => {
    expect(toCatalogItem({ ...apiItem, sku: null })).toBeNull();
    expect(toCatalogItem({ ...apiItem, id: "7311" })).toBeNull();
    expect(toCatalogItem({ ...apiItem, name: "  " })).toBeNull();
  });
});

describe("stockAtStore", () => {
  const item = toCatalogItem(apiItem)!;

  it("reads a known store's own warehouses by id", () => {
    expect(stockAtStore(item, { code: "NGH", name: "Nagoya Hill" })).toBe(27);
    // GATEWAY only, not INVENTARIS NAGOYA GATEWAY. Matching by name never
    // found it: "Nagoya Gateway" is not "GATEWAY".
    expect(stockAtStore(item, { code: "NGW", name: "Nagoya Gateway" })).toBe(24);
  });

  it("knows a known store with no row holds none", () => {
    const empty = toCatalogItem({ ...apiItem, stock: { total: 0, warehouses: [] } })!;
    expect(stockAtStore(empty, { code: "NGW", name: "Nagoya Gateway" })).toBe(0);
  });

  it("falls back to the name for a store it has no map for", () => {
    expect(stockAtStore(item, { code: "GU", name: "Gudang Utama" })).toBe(29);
    expect(stockAtStore(item, { code: "BTC", name: "Batam Center" })).toBeNull();
    expect(stockAtStore(item, { code: "GRY", name: "Griya" })).toBeNull();
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
