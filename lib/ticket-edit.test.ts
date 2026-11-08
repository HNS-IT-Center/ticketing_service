import { describe, expect, it } from "vitest";
import { describeChanges, diffTicketEdit, normalizePhone, parseTicketEdit, type TicketEditValues } from "./ticket-edit";
import { CAPABILITY_INFO, isAllowed } from "./access";

const current: TicketEditValues = {
  device_name: "ASUS VIVOBOK 14",
  device_sn: "SN123",
  accessories: "Charger",
  device_condition: null,
  customer_name: "Budi",
  customer_phone: "+62812345",
  customer_email: null,
  customer_address: null,
};
const service = { ticketType: "service", isForSelf: false, storeStock: false };

describe("normalizePhone", () => {
  it.each([
    ["0812-3456-789", "+628123456789"],
    ["62812 3456 789", "+628123456789"],
    ["+62 812 3456 789", "+628123456789"],
    ["8123456789", "+628123456789"],
  ])("%s → %s", (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it("returns a stored number unchanged, however odd", () => {
    for (const stored of ["+620000000000", "+628123456789", "+6262811"]) expect(normalizePhone(stored)).toBe(stored);
  });
  it("empty is null", () => {
    expect(normalizePhone("  ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("parseTicketEdit", () => {
  it("cleans spacing and records only what changed", () => {
    const r = parseTicketEdit({ ...current, device_name: "  ASUS  VIVOBOOK 14 " }, current, service);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(diffTicketEdit(current, r.values)).toEqual([{ field: "device_name", from: "ASUS VIVOBOK 14", to: "ASUS VIVOBOOK 14" }]);
  });

  it("refuses clearing the unit name, or the SN of a claim", () => {
    expect(parseTicketEdit({ ...current, device_name: " " }, current, service)).toEqual({ ok: false, error: "Nama unit tidak boleh dikosongkan." });
    expect(parseTicketEdit({ ...current, device_sn: "" }, current, { ...service, ticketType: "warranty_claim" }).ok).toBe(false);
    expect(parseTicketEdit({ ...current, device_sn: "" }, current, service).ok).toBe(true);
  });

  it("refuses what the database would refuse", () => {
    const r = parseTicketEdit({ ...current, device_sn: "x".repeat(192) }, current, service);
    expect(r).toEqual({ ok: false, error: "SN terlalu panjang (maks. 191 karakter)." });
  });

  it("requires the customer name, and checks an email", () => {
    expect(parseTicketEdit({ ...current, customer_name: "" }, current, service).ok).toBe(false);
    expect(parseTicketEdit({ ...current, customer_email: "budi@" }, current, service).ok).toBe(false);
    const r = parseTicketEdit({ ...current, customer_email: "Budi@Mail.com" }, current, service);
    expect(r.ok && r.values.customer_email).toBe("budi@mail.com");
  });

  it("leaves customer fields alone where the ticket has none", () => {
    for (const ctx of [{ ...service, isForSelf: true }, { ...service, ticketType: "warranty_claim", storeStock: true }]) {
      const r = parseTicketEdit({ ...current, customer_name: "Someone else", customer_phone: "0899" }, current, ctx);
      expect(r.ok).toBe(true);
      if (r.ok) expect(diffTicketEdit(current, r.values)).toEqual([]);
    }
  });
});

describe("describeChanges", () => {
  it("keeps the old value beside the new one", () => {
    expect(
      describeChanges("NGH-000001", [
        { field: "device_name", from: "ASUS VIVOBOK", to: "ASUS VIVOBOOK" },
        { field: "device_sn", from: null, to: "SN9" },
      ]),
    ).toBe('Mengubah data tiket NGH-000001 — Nama unit: "ASUS VIVOBOK" → "ASUS VIVOBOOK"; SN: (kosong) → "SN9".');
  });
});

describe("edit_ticket access", () => {
  it("is Admin only until the owner grants a group", () => {
    expect(CAPABILITY_INFO.edit_ticket.defaults).toEqual(["administrator"]);
    expect(isAllowed("edit_ticket", ["administrator"], new Map())).toBe(true);
    expect(isAllowed("edit_ticket", ["technician", "coordinator"], new Map())).toBe(false);
    expect(isAllowed("edit_ticket", ["rma"], new Map([["edit_ticket:rma", true]]))).toBe(true);
  });
});
