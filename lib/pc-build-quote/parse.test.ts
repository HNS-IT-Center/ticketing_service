import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/quote-hnspc-0027.json";
import { collapseSpaced, labelText, parseQuote, rupiahValue, type TextPiece } from "./parse";

// The text of "Quotation Rakitan PC _ HNS IT Center274.pdf" as unpdf reads it,
// with each piece's position: the real file the owner uploaded, 2026-11-05.
const pages = fixture as TextPiece[][];
const clone = () => pages.map((p) => p.map((t) => ({ ...t })));

describe("collapseSpaced / labelText", () => {
  it("joins letter-spaced capitals and leaves phrases alone", () => {
    expect(collapseSpaced("P R O C E S S O R")).toBe("PROCESSOR");
    expect(collapseSpaced("QT Y")).toBe("QTY");
    expect(collapseSpaced("T O TA L")).toBe("TOTAL");
    expect(collapseSpaced("JASA RAKIT PC")).toBe("JASA RAKIT PC");
  });

  it("puts the word breaks of known groups back", () => {
    expect(labelText("S S D / N V M E")).toBe("SSD / NVME");
    expect(labelText("J A S A R A K I T")).toBe("JASA RAKIT");
    expect(labelText("R A M")).toBe("RAM");
  });

  it("reads rupiah", () => {
    expect(rupiahValue("Rp 8.635.000")).toBe(8635000);
    expect(rupiahValue("—")).toBeNull();
  });
});

describe("parseQuote — the real quotation", () => {
  const result = parseQuote(pages);

  it("finds the number, customer, date and total", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.code).toBe("HNSPC-20261104-0027");
    expect(result.quote.customer).toBe("Cust Rakitan");
    expect(result.quote.date).toBe("4 November 2026");
    expect(result.quote.total).toBe(8635000);
    // This quotation was printed without a sales.
    expect(result.quote.salesName).toBeNull();
  });

  it("reads the sales when the header prints one", () => {
    const p = clone();
    p[0].push({ str: "Sales", x: 460, y: 699 }, { str: "Budi Santoso", x: 487, y: 699 });
    const r = parseQuote(p);
    if (!r.ok) throw new Error(r.error);
    expect(r.quote.salesName).toBe("Budi Santoso");
  });

  it("reads all seven lines across both pages, in order", () => {
    if (!result.ok) throw new Error(result.error);
    expect(result.quote.lines).toEqual([
      { label: "PROCESSOR", name: "PROCESSOR INTEL CORE I3-12100 TRAY 3.3Ghz", sku: "2606000158", quantity: 1 },
      { label: "MOTHERBOARD", name: "MOTHERBOARD ASUS PRIME H610M-K DDR4 LGA 1700 - mAtx", sku: "2504000288", quantity: 1 },
      { label: "RAM", name: "RAM PC DDR4 TEAM ELITE 8GB (1x8GB) 3200Mhz", sku: "2507000075", quantity: 1 },
      {
        label: "CASING",
        name: "CASING BEZZERA BX 220 MINI TOWER INCLUDE WITH PSU 500W - mATX",
        sku: "2509000273",
        quantity: 1,
      },
      // The variant on its own line is kept, after a dash.
      { label: "SSD / NVME", name: "SSD NVME ENPC 256GB - 512GB — 500GB+", sku: "2605000042", quantity: 1 },
      {
        label: "MONITOR",
        name: 'MONITOR SKYWORTH F22B30F 22" FLAT VA FHD (1920x1080) 120Hz 102%sRGB',
        sku: "2602000029",
        quantity: 1,
      },
      // A service line has no SKU, and its quantity sits on the name's row.
      { label: "JASA RAKIT", name: "JASA RAKIT PC", sku: null, quantity: 1 },
    ]);
  });
});

describe("parseQuote — refusals", () => {
  it("refuses a PDF without a quotation number", () => {
    const r = parseQuote([[{ str: "INVOICE", x: 40, y: 800 }, { str: "Nota pembelian", x: 40, y: 780 }]]);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("bukan quotation rakitan PC") });
  });

  it("refuses when fewer lines are read than the header states", () => {
    const p = clone();
    // Drop the monitor's block from page 2.
    p[1] = p[1].filter((t) => !(t.y <= 777 && t.y >= 717));
    const r = parseQuote(p);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("PDF menyebut 7 komponen tetapi yang terbaca 6") });
  });

  it("refuses a line whose quantity cannot be read", () => {
    const p = clone();
    p[0] = p[0].filter((t) => !(t.x === 530 && t.y === 574));
    const r = parseQuote(p);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Jumlah komponen ke-1") });
  });

  it("reads a larger quantity", () => {
    const p = clone();
    p[0] = p[0].map((t) => (t.x === 530 && t.y === 355 ? { ...t, str: "2" } : t));
    const r = parseQuote(p);
    if (!r.ok) throw new Error(r.error);
    expect(r.quote.lines[2]).toMatchObject({ label: "RAM", quantity: 2 });
  });
});
