import { describe, expect, it } from "vitest";
import {
  ageShares,
  longestWaiting,
  matchesPositionFilter,
  stageBreakdown,
  stageCounts,
  type PositionUnit,
} from "./unit-position";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 25);

const unit = (over: Partial<PositionUnit> & { daysAgo?: number } = {}): PositionUnit => {
  const { daysAgo = 0, ...rest } = over;
  return {
    stage: "in_vendor_process",
    ownership: "customer",
    vendor: null,
    vendorLocation: null,
    stageSince: new Date(NOW - daysAgo * DAY),
    ticketCode: `T-${Math.random()}`,
    rmaCode: null,
    caseId: null,
    device: null,
    ...rest,
  };
};

describe("unit position", () => {
  it("counts every stage, zero included", () => {
    const c = stageCounts([unit(), unit(), unit({ stage: "closed" }), unit({ stage: "not_handed" })]);
    expect(c.in_vendor_process).toBe(2);
    expect(c.closed).toBe(1);
    expect(c.not_handed).toBe(1);
    expect(c.on_hold).toBe(0);
  });

  it("puts each unit in exactly one age bucket, boundaries going up", () => {
    const shares = ageShares([unit({ daysAgo: 0 }), unit({ daysAgo: 7 }), unit({ daysAgo: 13 }), unit({ daysAgo: 14 }), unit({ daysAgo: 30 })], NOW);
    expect(shares.map((s) => s.count)).toEqual([1, 2, 1, 1]);
  });

  it("ranks vendors folded for case and spacing, and lists units without one apart", () => {
    const b = stageBreakdown([unit({ vendor: "Asus SC" }), unit({ vendor: "ASUS  sc" }), unit({ vendor: "Lenovo" }), unit()]);
    expect(b.title).toBe("Per vendor");
    expect(b.rows.map((r) => [r.label, r.count])).toEqual([
      ["ASUS SC", 2],
      ["LENOVO", 1],
      ["Belum ada vendor", 1],
    ]);
  });

  it("splits by ownership when no unit has a vendor yet", () => {
    const b = stageBreakdown([unit({ stage: "verified" }), unit({ stage: "verified", ownership: "store_stock" })]);
    expect(b.title).toBe("Per kepemilikan");
    expect(b.rows.map((r) => r.count)).toEqual([1, 1]);
  });

  it("lists the longest waits first", () => {
    const list = longestWaiting([unit({ daysAgo: 2, ticketCode: "A" }), unit({ daysAgo: 40, ticketCode: "B" }), unit({ daysAgo: 9, ticketCode: "C" })], 2);
    expect(list.map((u) => u.ticketCode)).toEqual(["B", "C"]);
  });

  it("applies the page's filters, status by open vs ended stage", () => {
    expect(matchesPositionFilter(unit({ stage: "closed" }), { status: "open" })).toBe(false);
    expect(matchesPositionFilter(unit({ stage: "not_handed" }), { status: "open" })).toBe(true);
    expect(matchesPositionFilter(unit({ ownership: "store_stock" }), { ownership: "customer" })).toBe(false);
    expect(matchesPositionFilter(unit({ vendorLocation: "in_town" }), { location: "out_of_town" })).toBe(false);
  });
});
