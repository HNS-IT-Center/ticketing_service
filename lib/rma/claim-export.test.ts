import { describe, expect, it } from "vitest";
import { claimDays, claimExportFilename, claimExportSheet, type ClaimExportRow } from "./claim-export";

const NOW = new Date("2026-11-04T03:00:00Z");

type Case = NonNullable<ClaimExportRow["rma_case"]>;

function claim(over: Partial<ClaimExportRow> = {}, rma: Partial<Case> | null = {}): ClaimExportRow {
  const base: Case = {
    rma_code: "RMA-NGW-2610-0010",
    status: "in_vendor_process",
    unit_ownership: "customer",
    stock_origin: null,
    fault_description: "Mati total",
    handed_over_at: new Date("2026-10-25T03:00:00Z"),
    recommended_eligible: true,
    handler: { name: "Restu" },
    hold_reason_code: null,
    hold_reason: null,
    vendor_name: "Asus Service Center",
    vendor: { location: "in_town" },
    vendor_rma_number: "ASC-1",
    customer_ticket_number: null,
    shipping_tracking: null,
    submitted_at: new Date("2026-10-27T03:00:00Z"),
    decision: null,
    decision_notes: null,
    replacement_sn: null,
    decided_at: null,
    unit_received_at: null,
    closed_at: null,
  };
  return {
    ticket_code: "NGW-000438",
    created_at: new Date("2026-10-20T03:00:00Z"),
    status: "rma_process",
    technician_id: "t",
    is_for_self: false,
    customer_name: "Kafka",
    customer_phone: "+62811",
    ticket_type: "warranty_claim",
    device_name: "ASUS TUF FA506NFR",
    device_sku: "2503000069",
    device_sn: "SN1",
    user: { name: "Admin" },
    technician: { name: "Budi" },
    store_location: { name: "Nagoya Gateway" },
    warranty_detail: { purchase_date: new Date("2026-01-10T00:00:00Z"), unit_ownership: "customer", stock_origin: null },
    rma_case: rma === null ? null : { ...base, ...rma },
    ...over,
  };
}

const cell = (t: ClaimExportRow, header: string) => {
  const sheet = claimExportSheet([t], NOW);
  const i = sheet.columns.findIndex((c) => c.header === header);
  expect(i, header).toBeGreaterThanOrEqual(0);
  return sheet.rows[0][i];
};

describe("claimDays", () => {
  it("counts from handover to close, or to now while open, and nothing before handover", () => {
    expect(claimDays({ handed_over_at: new Date("2026-10-25T03:00:00Z"), closed_at: null }, NOW)).toBe(10);
    expect(
      claimDays({ handed_over_at: new Date("2026-10-25T03:00:00Z"), closed_at: new Date("2026-10-28T02:00:00Z") }, NOW),
    ).toBe(2);
    expect(claimDays(null, NOW)).toBeNull();
  });
});

describe("claimExportSheet", () => {
  it("writes the case's path in words", () => {
    const t = claim({}, { hold_reason_code: "missing_damage_video", hold_reason: "kirim ulang", decision: "replaced" });
    expect(cell(t, "Kode RMA")).toBe("RMA-NGW-2610-0010");
    expect(cell(t, "Kepemilikan Unit")).toBe("Milik Customer");
    expect(cell(t, "Rekomendasi Teknisi")).toBe("Layak klaim");
    expect(cell(t, "Alasan Ditahan")).toBe("Video kerusakan belum ada — kirim ulang");
    expect(cell(t, "Keputusan Vendor")).toBe("Diganti unit baru");
    expect(String(cell(t, "Lokasi Vendor"))).toContain("LKL");
    expect(cell(t, "Lama Proses (hari)")).toBe(10);
    expect(cell(t, "Nama Barang")).toBe("ASUS TUF FA506NFR");
  });

  it("marks a claim not yet handed over, and names store stock", () => {
    const t = claim(
      {
        status: "on_progress",
        customer_name: null,
        warranty_detail: { purchase_date: null, unit_ownership: "store_stock", stock_origin: "Gudang" },
      },
      null,
    );
    expect(cell(t, "Kode RMA")).toBe("belum diserahkan");
    expect(cell(t, "Tahap RMA")).toBeNull();
    expect(cell(t, "Customer")).toBe("Stok Toko");
    expect(cell(t, "Kepemilikan Unit")).toBe("Stok Toko");
    expect(cell(t, "Asal Stok")).toBe("Gudang");
    expect(cell(t, "Lama Proses (hari)")).toBeNull();
  });

  it("has a value slot for every column", () => {
    const sheet = claimExportSheet([claim(), claim({}, null)], NOW);
    for (const row of sheet.rows) expect(row).toHaveLength(sheet.columns.length);
  });
});

describe("claimExportFilename", () => {
  it("is dated in WIB and names the chip", () => {
    expect(claimExportFilename(new Date("2026-11-03T18:00:00Z"), "all")).toBe("klaim-garansi-2026-11-04.xlsx");
    expect(claimExportFilename(NOW, "rma_process")).toBe("klaim-garansi-rma_process-2026-11-04.xlsx");
  });
});
