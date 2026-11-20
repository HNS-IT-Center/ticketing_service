import { describe, expect, it } from "vitest";
import { filterCustomers, groupCustomers, ticketCustomer, usablePhone, type CustomerTicket } from "./customers";

const t = (over: Partial<CustomerTicket>): CustomerTicket => ({
  ticket_type: "service",
  created_at: new Date("2026-11-01T03:00:00Z"),
  is_for_self: false,
  customer_name: "Budi",
  customer_phone: "+6281234567890",
  customer_email: null,
  user: { name: "Teknisi", role: "Technician", phone_number: null, email: null },
  store: "Nagoya Hill",
  ...over,
});

describe("groupCustomers", () => {
  it("makes one customer of tickets sharing a name and a number, however they were typed", () => {
    const rows = groupCustomers([
      t({ created_at: new Date("2026-10-01T00:00:00Z"), customer_phone: "081234567890" }),
      t({ ticket_type: "warranty_claim", created_at: new Date("2026-11-10T00:00:00Z"), customer_name: "BUDI ", store: "Nagoya Gateway" }),
      t({ created_at: new Date("2026-11-05T00:00:00Z"), customer_phone: "+62 812-3456-7890" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "BUDI", // the latest ticket's spelling
      phone: "+6281234567890",
      tickets: 3,
      types: [
        { type: "service", label: "Service", count: 2 },
        { type: "warranty_claim", label: "Klaim Garansi", count: 1 },
      ],
      stores: ["Nagoya Gateway", "Nagoya Hill"],
    });
    expect(rows[0].firstVisit.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(rows[0].lastVisit.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("keeps different names on one number apart: placeholders, the sales' number, an office line", () => {
    const rows = groupCustomers([
      t({ customer_name: "Jefri", customer_phone: "+62800000000" }),
      t({ customer_name: "Olivia", customer_phone: "0800000000" }),
      t({ customer_name: "Arika", customer_phone: "+6285210524834" }),
      t({ customer_name: "Sales Syahril", customer_phone: "+6285210524834" }),
    ]);
    expect(rows.map((r) => [r.name, r.phone]).sort()).toEqual([
      ["Arika", "+6285210524834"],
      ["Jefri", null],
      ["Olivia", null],
      ["Sales Syahril", "+6285210524834"],
    ]);
  });

  it("does not offer a placeholder as a number", () => {
    expect(usablePhone("+62800000000")).toBeNull();
    expect(usablePhone("0800000000")).toBeNull();
    expect(usablePhone("+628000000000")).toBeNull();
    expect(usablePhone("+628888888888")).toBeNull();
    expect(usablePhone("0812345")).toBeNull();
    expect(usablePhone("0812-3456-7890")).toBe("6281234567890");
  });

  it("keeps people without a number apart by name, and leaves out tickets with no customer", () => {
    const rows = groupCustomers([
      t({ customer_phone: null, customer_name: "Ani" }),
      t({ customer_phone: "", customer_name: "ani " }),
      t({ customer_phone: null, customer_name: "Citra" }),
      t({ ticket_type: "warranty_claim", customer_name: null, customer_phone: null }), // store stock
      t({ ticket_type: "warranty_claim", customer_name: "STOK TOKO GATEWAY", customer_phone: null }), // old invented name
      t({ is_for_self: true, customer_name: null, customer_phone: null }), // booked by staff for themselves
    ]);
    expect(rows.map((r) => [r.name, r.phone, r.tickets])).toEqual([
      ["Ani", null, 2],
      ["Citra", null, 1],
    ]);
  });

  it("takes a Customer account's own details for a ticket booked for themselves", () => {
    expect(
      ticketCustomer(t({ is_for_self: true, customer_name: null, customer_phone: null, user: { name: "John Doe", role: "Customer", phone_number: "+628111", email: "j@x.id" } })),
    ).toEqual({ name: "John Doe", phone: "+628111", email: "j@x.id" });
  });
});

describe("filterCustomers", () => {
  const rows = groupCustomers([
    t({ customer_name: "Budi", customer_phone: "+6281234567890" }),
    t({ customer_name: "Siti", customer_phone: "+6285700001111", ticket_type: "pc_build" }),
  ]);
  it("finds by name, and by number typed as 0812…, 62812… or part of it", () => {
    expect(filterCustomers(rows, "sit", null).map((r) => r.name)).toEqual(["Siti"]);
    expect(filterCustomers(rows, "081234567890", null).map((r) => r.name)).toEqual(["Budi"]);
    expect(filterCustomers(rows, "0857", null).map((r) => r.name)).toEqual(["Siti"]);
    expect(filterCustomers(rows, "", null)).toHaveLength(2);
  });
  it("keeps customers who came for the chosen kind", () => {
    expect(filterCustomers(rows, "", "pc_build").map((r) => r.name)).toEqual(["Siti"]);
  });
});
