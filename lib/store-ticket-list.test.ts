import { describe, expect, it } from "vitest";
import { storeTicketWhere } from "./store-ticket-list";

describe("storeTicketWhere", () => {
  it("always limits to the viewer's stores, and keeps every filter", () => {
    const w = storeTicketWhere({ storeIds: ["s1"], status: "unassigned", query: "", technicianId: "t1", type: "cleaning" });
    expect(w.AND).toEqual([
      { store_location_id: { in: ["s1"] } },
      { technician_id: null },
      { technician_id: "t1" },
      { ticket_type: "cleaning" },
    ]);
  });
  it("ignores an unknown type and an empty search", () => {
    expect(storeTicketWhere({ storeIds: [], status: "all", query: " ", type: "laptop" }).AND).toEqual([
      { store_location_id: { in: [] } },
    ]);
  });
});
