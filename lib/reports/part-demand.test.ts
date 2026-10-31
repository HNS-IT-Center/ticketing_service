import { describe, it, expect } from "vitest";
import type { PartReportRow } from "./parts";
import { demandWindow, outsideCatalog, rankCatalogDemand, worthStocking } from "./part-demand";

const row = (o: Partial<PartReportRow>): PartReportRow => ({
  id: Math.random().toString(36),
  createdAt: new Date("2026-10-05T03:00:00Z"),
  part: "battery",
  itemName: "Baterai ASUS C31N1915",
  sku: "BAT-1",
  catalogItemId: 11,
  catalogCategory: "BATERAI",
  quantity: 1,
  notes: null,
  ticketId: "t1",
  ticketCode: "NGW-1",
  storeName: null,
  technicianName: "Budi",
  ...o,
});

describe("demandWindow", () => {
  it("spans three WIB months ending with the chosen one, across a year end", () => {
    const w = demandWindow("2026-02")!;
    expect(w.firstMonth).toBe("2025-12");
    // 1 Dec 2025 00:00 WIB, and 1 Mar 2026 00:00 WIB.
    expect(w.start.toISOString()).toBe("2025-11-30T17:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-02-28T17:00:00.000Z");
  });
  it("refuses a malformed month", () => {
    expect(demandWindow("2026-13")).toBeNull();
  });
});

describe("rankCatalogDemand", () => {
  it("ranks catalogue items by times used, counting tickets and the months they were used in", () => {
    const ranked = rankCatalogDemand([
      row({ ticketId: "t1", createdAt: new Date("2026-08-10T03:00:00Z") }),
      row({ ticketId: "t2", quantity: 2, createdAt: new Date("2026-10-01T03:00:00Z") }),
      row({ ticketId: "t3", sku: "LCD-1", itemName: "LCD 14 FHD", catalogItemId: 12, part: "lcd" }),
      row({ ticketId: "t4", sku: null, itemName: "baterai kw", catalogItemId: null }),
    ]);
    expect(ranked.map((r) => r.sku)).toEqual(["BAT-1", "LCD-1"]);
    expect(ranked[0]).toMatchObject({ uses: 2, quantity: 3, tickets: 2, months: 2, catalogItemId: 11 });
  });

  it("names an item after its newest record, in case the catalogue renamed it", () => {
    const ranked = rankCatalogDemand([
      row({ itemName: "Nama lama", createdAt: new Date("2026-08-01T03:00:00Z") }),
      row({ itemName: "Nama baru", createdAt: new Date("2026-10-01T03:00:00Z") }),
    ]);
    expect(ranked[0].name).toBe("Nama baru");
  });

  it("puts a part fitted on the last evening of a month in that month, by WIB", () => {
    // 23:30 WIB on 31 August.
    const ranked = rankCatalogDemand([
      row({ createdAt: new Date("2026-08-31T16:30:00Z") }),
      row({ createdAt: new Date("2026-08-15T03:00:00Z") }),
    ]);
    expect(ranked[0].months).toBe(1);
  });
});

describe("outsideCatalog", () => {
  it("groups typed parts by category and name, ignoring case and spacing, showing the commonest spelling", () => {
    const out = outsideCatalog([
      row({ sku: null, catalogItemId: null, itemName: "Baterai KW 6 cell", ticketId: "t3", ticketCode: "NGW-3" }),
      row({ sku: null, catalogItemId: null, itemName: "baterai  kw 6 CELL", ticketId: "t2", ticketCode: "NGW-2" }),
      row({ sku: null, catalogItemId: null, itemName: "Baterai KW 6 cell", quantity: 2, ticketId: "t3", ticketCode: "NGW-3" }),
      row({ sku: null, catalogItemId: null, itemName: "Baterai KW 6 cell", part: "other" }),
      row({ sku: "BAT-1" }),
    ]);
    expect(out[0]).toEqual({
      part: "battery",
      name: "Baterai KW 6 cell",
      uses: 3,
      quantity: 4,
      // Each ticket once, in the order the rows came — the tickets to chase for a code.
      tickets: [
        { id: "t3", code: "NGW-3" },
        { id: "t2", code: "NGW-2" },
      ],
    });
    expect(out).toHaveLength(2);
  });

  it("names a part typed with no name", () => {
    expect(outsideCatalog([row({ sku: null, itemName: null })])[0].name).toBe("(tanpa nama barang)");
  });
});

describe("worthStocking", () => {
  it("flags an item used often with none in stock, and only that", () => {
    expect(worthStocking({ uses: 3 }, 0)).toBe(true);
    expect(worthStocking({ uses: 2 }, 0)).toBe(false);
    expect(worthStocking({ uses: 5 }, 1)).toBe(false);
    // Unknown stock is not a reason to buy.
    expect(worthStocking({ uses: 5 }, null)).toBe(false);
  });
});
