import { describe, it, expect } from "vitest";
import fixture from "./__fixtures__/quote-api-0027.json";
import {
  checkableIndexes,
  findQuoteCode,
  itemKind,
  parseQuoteRef,
  quoteLineKind,
  quoteRefPath,
  quoteSourceLines,
  readEcommerceQuote,
} from "./quote-contract";

const clone = () => JSON.parse(JSON.stringify(fixture)) as Record<string, unknown> & { items: Record<string, unknown>[] };

describe("parseQuoteRef", () => {
  it("reads a code, forgiving case and spaces, in both the new and the older format", () => {
    expect(parseQuoteRef(" hnspc-20261104-0027 ")).toEqual({ by: "code", code: "HNSPC-20261104-0027" });
    expect(parseQuoteRef("HNSPC-260928-Z5ND")).toEqual({ by: "code", code: "HNSPC-260928-Z5ND" });
  });

  it("reads the customer link sales send", () => {
    expect(parseQuoteRef("https://hnsitcenter.id/q/Ab3dEf6hIj9kLm?x=1")).toEqual({ by: "token", token: "Ab3dEf6hIj9kLm" });
  });

  it("finds the code in the verify link printed on the PDF, on any host", () => {
    expect(parseQuoteRef("https://hnsitcenter.id/verify/HNSPC-20261116-0171")).toEqual({ by: "code", code: "HNSPC-20261116-0171" });
    expect(parseQuoteRef("http://localhost:3000/verify/hnspc-20261116-0171?x=1")).toEqual({ by: "code", code: "HNSPC-20261116-0171" });
    expect(parseQuoteRef("https://hnsitcenter.id/verify/")).toBeNull();
  });

  it("takes the e-commerce server's code rule: a long number, a visitor code, never the revision", () => {
    expect(findQuoteCode("HNSPC-20261116-123456")).toBe("HNSPC-20261116-123456");
    expect(findQuoteCode("No. HNSPC-260928-z5nd")).toBe("HNSPC-260928-Z5ND");
    expect(findQuoteCode("HNSPC-20261116-0171 Rev. 2")).toBe("HNSPC-20261116-0171");
    for (const bad of ["HNSPC-20261116-017", "HNSPC-2026111-0171", "XHNSPC-20261116-0171", "HNSPC-260928-Z5ND9", "ABC-20261116-0171"]) {
      expect(findQuoteCode(bad)).toBeNull();
    }
  });

  it("refuses anything else", () => {
    for (const bad of ["", "   ", "abc", "HNSPC/2026", "https://hnsitcenter.id/q/a", "x".repeat(40)]) expect(parseQuoteRef(bad)).toBeNull();
  });

  it("builds the two paths, escaped", () => {
    expect(quoteRefPath({ by: "code", code: "HNSPC-1" })).toBe("/api/integrations/ticketing/pc-build-quotes/HNSPC-1");
    expect(quoteRefPath({ by: "token", token: "Ab_-9xyzQ" })).toBe("/api/integrations/ticketing/pc-build-quotes/by-token/Ab_-9xyzQ");
  });
});

describe("readEcommerceQuote", () => {
  it("reads the agreed body", () => {
    const q = readEcommerceQuote(fixture);
    expect(q).toMatchObject({
      code: "HNSPC-20261104-0027",
      revision: 3,
      status: "closing",
      customer: { name: "Cust Rakitan", phone: "0812-3456 7890" },
      sales: { email: "sales.web@example.test", ssoSub: "sub-sales-web" },
      publicUrl: "https://hnsitcenter.id/q/Ab3dEf6hIj9kLm",
    });
    expect(q?.items).toHaveLength(4);
    expect(q?.items[3]).toMatchObject({ stepKind: "service", accurateCode: "101048", unitPrice: 175000 });
  });

  it("accepts a body without the newer optional fields", () => {
    const b = clone();
    delete b.sales;
    for (const i of b.items) delete i.stepKind;
    const q = readEcommerceQuote(b);
    expect(q?.sales).toBeNull();
    expect(q?.items.every((i) => i.stepKind === null)).toBe(true);
  });

  it("refuses a body with a field missing or of the wrong type, whole", () => {
    const cases: ((b: ReturnType<typeof clone>) => void)[] = [
      (b) => delete b.revision,
      (b) => (b.status = "draft"),
      (b) => (b.total = "3975000"),
      (b) => (b.items[0].quantity = 0),
      (b) => (b.items[1].sku = 42),
      (b) => (b.customer = null),
      (b) => (b.items = null as unknown as typeof b.items),
    ];
    for (const change of cases) {
      const b = clone();
      change(b);
      expect(readEcommerceQuote(b)).toBeNull();
    }
    expect(readEcommerceQuote(null)).toBeNull();
    expect(readEcommerceQuote("nope")).toBeNull();
  });

  it("drops a public link that is not https", () => {
    const b = clone();
    b.publicUrl = "javascript:alert(1)";
    expect(readEcommerceQuote(b)?.publicUrl).toBeNull();
  });
});

describe("quoteLineKind", () => {
  it("lets the e-commerce side's own kind win", () => {
    expect(quoteLineKind("peripheral", "Processor")).toBe("peripheral");
  });

  it("falls back to the step's name, as on a PDF", () => {
    expect(quoteLineKind(null, "Jasa Rakit")).toBe("service");
    expect(quoteLineKind(null, "JASA RAKIT")).toBe("service");
    expect(quoteLineKind(null, "Monitor")).toBe("peripheral");
    expect(quoteLineKind(null, "Headset & Audio")).toBe("peripheral");
    expect(quoteLineKind(null, "Network & Cables")).toBe("peripheral");
    expect(quoteLineKind(null, "", "JASA RAKIT PC")).toBe("service");
  });

  it("calls anything unrecognised a component, so it is checked by hand", () => {
    expect(quoteLineKind(null, "Komponen Baru")).toBe("component");
    expect(quoteLineKind(null, null)).toBe("component");
  });
});

describe("quoteSourceLines", () => {
  it("uses the Accurate code over the printed SKU, keeps the variant in the name and the price", () => {
    const lines = quoteSourceLines(readEcommerceQuote(fixture)!);
    expect(lines.map((l) => [l.label, l.name, l.sku, l.kind, l.unitPrice])).toEqual([
      ["Processor", "PROCESSOR INTEL CORE I3-12100 TRAY 3.3Ghz", "2606000158", "component", 1650000],
      ["SSD / NVMe", "SSD NVME ENPC — 512GB · Hitam", "2605000099", "component", 650000],
      ["Monitor", "MONITOR XIAOMI A24i", "2602000029", "peripheral", 1500000],
      ["Jasa Rakit", "JASA RAKIT PC", "101048", "service", 175000],
    ]);
  });

  it("gives an older quotation's assembly fee a line of its own", () => {
    const b = clone();
    b.items = b.items.slice(0, 3);
    b.assemblyFee = 150000;
    const lines = quoteSourceLines(readEcommerceQuote(b)!);
    expect(lines.at(-1)).toEqual({ label: "Jasa Rakit", name: "JASA RAKIT PC", sku: null, quantity: 1, unitPrice: 150000, kind: "service" });
  });

  it("adds none when the fee is 0, or already a line", () => {
    const b = clone();
    b.assemblyFee = 150000; // a fee and a line: the line is the record
    expect(quoteSourceLines(readEcommerceQuote(b)!).filter((l) => l.kind === "service")).toHaveLength(1);
    const c = clone();
    c.items = c.items.slice(0, 3);
    expect(quoteSourceLines(readEcommerceQuote(c)!).some((l) => l.kind === "service")).toBe(false);
  });
});

describe("the ticket rules", () => {
  it("ticks components and peripherals, never a service line", () => {
    const items = quoteSourceLines(readEcommerceQuote(fixture)!);
    expect(checkableIndexes(items)).toEqual([0, 1, 2]);
    // A draft saved before kinds existed: read from the label.
    expect(itemKind({ label: "JASA RAKIT", name: "JASA RAKIT PC" })).toBe("service");
  });
});
