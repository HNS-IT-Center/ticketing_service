import { describe, expect, it } from "vitest";
import { chargeTotals, ticketExportFilename, ticketExportSheet, type TicketExportRow } from "./ticket-export";

function ticket(over: Partial<TicketExportRow> = {}): TicketExportRow {
  return {
    ticket_code: "NGW-000001",
    created_at: new Date("2026-11-01T03:00:00Z"),
    updated_at: new Date("2026-11-01T05:00:00Z"),
    ticket_type: "service",
    status: "waiting",
    device_type: "Laptop_Office",
    device_name: "NB ASUS VIVOBOOK 14",
    device_sku: "2503000069",
    device_brand: "ASUS",
    device_sn: "SN123",
    accessories: "Charger",
    device_condition: "Lecet",
    is_for_self: false,
    customer_name: "Budi",
    customer_phone: "+628123",
    customer_email: null,
    customer_type: "User",
    pickup_method: "self_pickup",
    technician_id: null,
    work_started_at: null,
    work_completed_at: null,
    user: { name: "Admin" },
    technician: null,
    sales: null,
    store_location: { name: "Nagoya Gateway" },
    rma_case: null,
    charges: [],
    ...over,
  };
}

const cell = (t: TicketExportRow, header: string) => {
  const sheet = ticketExportSheet([t]);
  const i = sheet.columns.findIndex((c) => c.header === header);
  expect(i, header).toBeGreaterThanOrEqual(0);
  return sheet.rows[0][i];
};

describe("chargeTotals", () => {
  it("is empty for a ticket with no bill", () => {
    expect(chargeTotals([])).toEqual({ total: null, complete: null });
  });

  it("sums priced lines × quantity and says when a line has no price", () => {
    expect(
      chargeTotals([
        { quantity: 2, unit_price: 50_000 },
        { quantity: 1, unit_price: 0 },
      ]),
    ).toEqual({ total: 100_000, complete: true });
    expect(
      chargeTotals([
        { quantity: 1, unit_price: 75_000 },
        { quantity: 1, unit_price: null },
      ]),
    ).toEqual({ total: 75_000, complete: false });
  });
});

describe("ticketExportSheet", () => {
  it("has one row per ticket and a value slot per column", () => {
    const sheet = ticketExportSheet([ticket(), ticket({ ticket_code: "NGW-000002" })]);
    expect(sheet.rows).toHaveLength(2);
    for (const row of sheet.rows) expect(row).toHaveLength(sheet.columns.length);
  });

  it("writes labels, not enum names", () => {
    const t = ticket({ ticket_type: "warranty_claim", device_type: "Other_Device", customer_type: "Internet_Cafe" });
    expect(cell(t, "Jenis Tiket")).toBe("Klaim Garansi");
    expect(cell(t, "Jenis Perangkat")).toBe("Perangkat Lain");
    expect(cell(t, "Tipe Customer")).toBe("Warnet");
    expect(cell(t, "Pengambilan")).toBe("Ambil Sendiri");
    expect(cell(t, "Status")).toBe("Waiting for Technician");
  });

  it("names the RMA stage beside the ticket status", () => {
    const t = ticket({ status: "rma_process", technician_id: "x", rma_case: { status: "on_hold" } });
    expect(cell(t, "Status")).toBe("RMA Process");
    expect(cell(t, "Tahap RMA")).not.toBeNull();
    expect(cell(ticket(), "Tahap RMA")).toBeNull();
  });

  it("names a store-stock claim the way the list does", () => {
    const t = ticket({ ticket_type: "warranty_claim", customer_name: null });
    expect(cell(t, "Customer")).toBe("Stok Toko");
  });

  it("keeps dates as dates and the total as a number", () => {
    const t = ticket({ charges: [{ quantity: 1, unit_price: 150_000 }] });
    expect(cell(t, "Tanggal Masuk")).toBeInstanceOf(Date);
    expect(cell(t, "Total Biaya (Rp)")).toBe(150_000);
    expect(cell(t, "Harga Lengkap")).toBe("Ya");
  });

  it("carries no cost column", () => {
    const headers = ticketExportSheet([]).columns.map((c) => c.header.toLowerCase());
    expect(headers.some((h) => h.includes("modal") || h.includes("cost") || h.includes("margin"))).toBe(false);
  });
});

describe("ticketExportFilename", () => {
  it("is dated in WIB and names the chip", () => {
    const lateEvening = new Date("2026-11-01T18:30:00Z"); // 01:30 on the 2nd in Batam
    expect(ticketExportFilename(lateEvening, "all")).toBe("tiket-hns-2026-11-02.xlsx");
    expect(ticketExportFilename(lateEvening, "done")).toBe("tiket-hns-done-2026-11-02.xlsx");
    expect(ticketExportFilename(lateEvening, 'x"; rm')).toBe("tiket-hns-xrm-2026-11-02.xlsx");
  });
});
