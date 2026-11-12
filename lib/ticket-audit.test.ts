import { describe, it, expect } from "vitest";
import { auditReasons, normalizePhone, reasonText } from "./ticket-audit";

const staff = [
  { name: "Febrian", phone_number: "+6281234567890" },
  { name: "Dwi Prasetyo", phone_number: "0899 111 222" },
];
const t = (over: Partial<Parameters<typeof auditReasons>[0]>) => ({ customer: "Budi", customer_phone: "+628777000111", device_name: "ASUS", extra_ticks: 0, ...over });

describe("ticket audit", () => {
  it("flags a customer named like a staff member, by full or first name", () => {
    expect(auditReasons(t({ customer: "febrian" }), staff)).toEqual([{ kind: "staff_name", staff: "Febrian" }]);
    expect(auditReasons(t({ customer: "Dwi" }), staff)).toEqual([{ kind: "staff_name", staff: "Dwi Prasetyo" }]);
  });

  it("flags a staff member's phone, whatever its spelling", () => {
    expect(normalizePhone("0899-111-222")).toBe(normalizePhone("+62899111222"));
    expect(auditReasons(t({ customer_phone: "08123 4567 890" }), staff)).toEqual([{ kind: "staff_phone", staff: "Febrian" }]);
  });

  it("flags test-like names and many old ticks, and leaves an ordinary ticket alone", () => {
    expect(auditReasons(t({ customer: "test test" }), staff).map((r) => r.kind)).toEqual(["test_data"]);
    expect(auditReasons(t({ extra_ticks: 6 }), staff).map(reasonText)).toEqual(["6 centang Extra Services lama"]);
    expect(auditReasons(t({ customer: "Testimoni Jaya", device_name: "Lenovo" }), staff)).toEqual([]);
    expect(auditReasons(t({}), staff)).toEqual([]);
  });
});
