import { describe, expect, it } from "vitest";
import {
  ADMIN_TICKET_FILTERS,
  TECHNICIAN_TICKET_FILTERS,
  isTicketStatus,
  ticketListWhere,
} from "./ticket-list-filter";

describe("ticketListWhere", () => {
  it("filters a warranty claim by type, not by status", () => {
    // The point of the chip: a claim is found whether it is still with the
    // technician, parked at the RMA desk, or already back and done.
    expect(ticketListWhere("warranty_claim")).toEqual({ ticket_type: "warranty_claim" });
  });

  it("filters unassigned by technician_id", () => {
    expect(ticketListWhere("unassigned")).toEqual({ technician_id: null });
  });

  it("filters a real status by status", () => {
    expect(ticketListWhere("waiting")).toEqual({ status: "waiting" });
    expect(ticketListWhere("on_progress")).toEqual({ status: "on_progress" });
    expect(ticketListWhere("rejected")).toEqual({ status: "rejected" });
  });

  it("returns no constraint for 'all'", () => {
    expect(ticketListWhere("all")).toEqual({});
  });

  it("returns no constraint for a key that is not a status — never reaches the database as an invalid enum", () => {
    for (const junk of ["", "DROP TABLE", "Waiting", "done ", "warranty", "123"]) {
      expect(ticketListWhere(junk)).toEqual({});
    }
  });
});

describe("isTicketStatus", () => {
  it("accepts every status the schema has", () => {
    for (const s of [
      "waiting", "on_progress", "rma_process", "done", "ready_for_pickup",
      "waiting_pickup", "handed_to_courier", "delivered", "completed",
      "cancelled", "rejected",
    ]) {
      expect(isTicketStatus(s)).toBe(true);
    }
  });

  it("rejects the two chips that are not statuses", () => {
    expect(isTicketStatus("all")).toBe(false);
    expect(isTicketStatus("unassigned")).toBe(false);
    expect(isTicketStatus("warranty_claim")).toBe(false);
  });
});

describe("filter sets", () => {
  it("both portals offer the warranty claim chip", () => {
    for (const set of [ADMIN_TICKET_FILTERS, TECHNICIAN_TICKET_FILTERS]) {
      expect(set.map((f) => f.key)).toContain("warranty_claim");
    }
  });

  it("every chip key resolves to a filter the database accepts", () => {
    for (const set of [ADMIN_TICKET_FILTERS, TECHNICIAN_TICKET_FILTERS]) {
      for (const f of set) {
        const where = ticketListWhere(f.key);
        if (f.key === "all") expect(where).toEqual({});
        else expect(Object.keys(where)).toHaveLength(1);
      }
    }
  });

  it("has no duplicate keys", () => {
    for (const set of [ADMIN_TICKET_FILTERS, TECHNICIAN_TICKET_FILTERS]) {
      const keys = set.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("only the admin list offers Unassigned", () => {
    expect(ADMIN_TICKET_FILTERS.map((f) => f.key)).toContain("unassigned");
    expect(TECHNICIAN_TICKET_FILTERS.map((f) => f.key)).not.toContain("unassigned");
  });
});
