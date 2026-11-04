import { describe, expect, it } from "vitest";
import { relativeTimeId, ticketRecency } from "./ticket-recency";
import { DEFAULT_TICKET_SORT, ticketListOrderBy } from "./ticket-list-filter";

const NOW = new Date("2026-11-04T10:00:00Z");
const h = (hours: number) => new Date(NOW.getTime() - hours * 3600_000);

describe("ticketRecency", () => {
  it("marks a ticket created today as new, its own first log notwithstanding", () => {
    expect(ticketRecency({ created_at: h(2), updated_at: h(2), last_status_at: h(2) }, NOW)).toEqual({ kind: "new", at: h(2) });
  });

  it("marks a status move within a day as an update, however old the ticket", () => {
    expect(ticketRecency({ created_at: h(200), updated_at: h(3), last_status_at: h(3) }, NOW)).toEqual({
      kind: "updated",
      at: h(3),
    });
    // A new ticket that already moved reads as updated.
    expect(ticketRecency({ created_at: h(5), updated_at: h(1), last_status_at: h(1) }, NOW)?.kind).toBe("updated");
  });

  it("marks nothing older than a day", () => {
    expect(ticketRecency({ created_at: h(200), updated_at: h(30), last_status_at: h(30) }, NOW)).toBeNull();
  });

  it("falls back to updated_at when there is no status log", () => {
    expect(ticketRecency({ created_at: h(100), updated_at: h(4) }, NOW)?.kind).toBe("updated");
  });
});

describe("relativeTimeId", () => {
  it("speaks Indonesian", () => {
    expect(relativeTimeId(new Date(NOW.getTime() - 20_000), NOW)).toBe("baru saja");
    expect(relativeTimeId(h(0.25), NOW)).toBe("15 menit lalu");
    expect(relativeTimeId(h(3), NOW)).toBe("3 jam lalu");
  });
});

describe("All Tickets order", () => {
  it("puts the most recently created or updated first by default", () => {
    expect(ticketListOrderBy("")).toEqual({ updated_at: "desc" });
    expect(ticketListOrderBy(DEFAULT_TICKET_SORT)).toEqual({ updated_at: "desc" });
    expect(ticketListOrderBy("created_desc")).toEqual({ created_at: "desc" });
  });
});
