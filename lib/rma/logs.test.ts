import { describe, expect, it, vi } from "vitest";
import type { RmaLogFilters } from "./logs";

// lib/rma/logs.ts pulls in lib/db.ts, which is server-only.
vi.mock("server-only", () => ({}));

const { buildEventWhere, hasAnyFilter, isRmaLogView, LOG_FILTER_STATUSES } = await import("./logs");

const NONE: RmaLogFilters = { q: "", status: "", from: "", to: "" };

describe("hasAnyFilter", () => {
  it("is false when nothing is filled in", () => {
    expect(hasAnyFilter(NONE)).toBe(false);
  });

  it("is true for a search term, a known stage, or a usable date", () => {
    expect(hasAnyFilter({ ...NONE, q: "NGH" })).toBe(true);
    expect(hasAnyFilter({ ...NONE, status: "on_hold" })).toBe(true);
    expect(hasAnyFilter({ ...NONE, from: "2026-10-02" })).toBe(true);
    expect(hasAnyFilter({ ...NONE, to: "2026-10-02" })).toBe(true);
  });

  it("is false for input the query drops, so the page cannot claim a filter it never applied", () => {
    // Both of these reach the page as non-empty strings, and the old check —
    // "is any box filled in" — would have labelled the complete, unfiltered
    // list as "cocok dengan filter".
    expect(hasAnyFilter({ ...NONE, status: "bukan_status" })).toBe(false);
    expect(hasAnyFilter({ ...NONE, from: "besok", to: "lusa" })).toBe(false);
  });
});

describe("buildEventWhere", () => {
  it("builds no key at all when the filter is empty", () => {
    expect(buildEventWhere(NONE)).toEqual({});
  });

  it("searches the RMA code, the ticket, the customer, the actor and the note", () => {
    expect(buildEventWhere({ ...NONE, q: "ngh" }).OR).toHaveLength(5);
  });

  it("keeps a known stage and drops anything else", () => {
    expect(buildEventWhere({ ...NONE, status: "on_hold" }).to_status).toBe("on_hold");
    expect(buildEventWhere({ ...NONE, status: "bukan_status" }).to_status).toBeUndefined();
  });

  it("accepts every stage the filter offers", () => {
    for (const status of LOG_FILTER_STATUSES) {
      expect(buildEventWhere({ ...NONE, status }).to_status).toBe(status);
    }
  });

  it("turns the two date boxes into one half-open interval", () => {
    const where = buildEventWhere({ ...NONE, from: "2026-10-02", to: "2026-10-02" });
    expect(where.created_at).toEqual({
      gte: new Date("2026-10-01T17:00:00.000Z"),
      lt: new Date("2026-10-02T17:00:00.000Z"),
    });
  });
});

describe("LOG_FILTER_STATUSES", () => {
  it("offers the terminal stages too, so a closed case can still be found", () => {
    expect(LOG_FILTER_STATUSES).toContain("closed");
    expect(LOG_FILTER_STATUSES).toContain("cancelled");
    // Added here: the old page's filter left it out, so a case the desk turned
    // down was unreachable by stage.
    expect(LOG_FILTER_STATUSES).toContain("ineligible");
  });
});

describe("isRmaLogView", () => {
  it("accepts only the two views the page can render", () => {
    expect(isRmaLogView("case")).toBe(true);
    expect(isRmaLogView("time")).toBe(true);
    expect(isRmaLogView("sembarang")).toBe(false);
    expect(isRmaLogView(undefined)).toBe(false);
  });
});
