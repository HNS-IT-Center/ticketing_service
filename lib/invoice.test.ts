import { describe, it, expect } from "vitest";
import type { ChargeRow } from "./charges";
import { buildInvoice, invoiceDate, invoiceFormat } from "./invoice";

const line = (o: Partial<ChargeRow>): ChargeRow => ({
  id: Math.random().toString(36),
  kind: "service_fee",
  description: "Ganti LCD",
  quantity: 1,
  unit_price: 150000,
  vendor: null,
  service_job: null,
  job_points: null,
  is_part: false,
  sent_at: null,
  returned_at: null,
  external_result: null,
  external_note: null,
  created_by_name: "Budi",
  ...o,
});

describe("buildInvoice", () => {
  it("numbers the lines, multiplies by quantity and totals them", () => {
    const inv = buildInvoice([
      line({ kind: "part", description: "LCD 14 FHD", unit_price: 900000, is_part: true }),
      line({ quantity: 2, unit_price: 100000, description: "Install Ulang OS" }),
    ]);
    expect(inv.lines).toEqual([
      { no: 1, description: "LCD 14 FHD", quantity: 1, unitPrice: 900000, amount: 900000 },
      { no: 2, description: "Install Ulang OS", quantity: 2, unitPrice: 100000, amount: 200000 },
    ]);
    expect(inv).toMatchObject({ total: 1100000, isDraft: false, reasons: [] });
  });

  it("is a draft while a line has no price — the total would be short", () => {
    const inv = buildInvoice([line({}), line({ unit_price: null })]);
    expect(inv).toMatchObject({ total: 150000, unpriced: 1, isDraft: true });
    expect(inv.lines[1]).toMatchObject({ unitPrice: null, amount: null });
    expect(inv.reasons.join(" ")).toContain("1 baris belum ada harga");
  });

  it("is a draft while work is at a vendor, and once it is back it is not", () => {
    const away = line({ kind: "external_service", sent_at: "2026-10-20T03:00:00Z", unit_price: 450000 });
    expect(buildInvoice([away])).toMatchObject({ atVendor: 1, isDraft: true });
    expect(buildInvoice([{ ...away, returned_at: "2026-10-22T03:00:00Z" }])).toMatchObject({ atVendor: 0, isDraft: false });
  });

  it("is a draft with nothing on it", () => {
    expect(buildInvoice([])).toMatchObject({ total: 0, isDraft: true, reasons: ["Belum ada biaya yang dicatat."] });
  });

  it("treats a price of 0 as a price — a warranty swap billed at nothing", () => {
    expect(buildInvoice([line({ unit_price: 0 })])).toMatchObject({ total: 0, isDraft: false });
  });
});

describe("invoice helpers", () => {
  it("dates in Batam time", () => {
    // 23:30 WIB on 31 October is still the 31st.
    expect(invoiceDate(new Date("2026-10-31T16:30:00Z"))).toBe("31 Okt 2026");
  });
  it("prints A4 unless the receipt size is asked for", () => {
    expect(invoiceFormat("struk")).toBe("struk");
    expect(invoiceFormat(undefined)).toBe("a4");
    expect(invoiceFormat("anything")).toBe("a4");
  });
});
