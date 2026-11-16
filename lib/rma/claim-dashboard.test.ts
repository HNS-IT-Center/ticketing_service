import { describe, expect, it } from "vitest";
import {
  locationShares,
  matchesFilter,
  monthFigures,
  monthsBetween,
  ownershipShares,
  ranking,
  readCaseFilter,
  shiftMonth,
  type DashboardCase,
} from "./claim-dashboard";

const d = (s: string) => new Date(`${s}T12:00:00+07:00`);
const oct = { start: new Date("2026-10-01T00:00:00+07:00"), end: new Date("2026-11-01T00:00:00+07:00") };

const c = (handed: string, closed: string | null, over: Partial<DashboardCase> = {}): DashboardCase => ({
  handedOverAt: d(handed),
  closedAt: closed ? d(closed) : null,
  ownership: "customer",
  vendor: null,
  vendorLocation: null,
  brand: null,
  ...over,
});

describe("monthFigures", () => {
  const cases = [
    c("2026-09-10", null), // outstanding: open since September
    c("2026-09-12", "2026-10-05"), // outstanding at 1 Oct, ended in October
    c("2026-09-20", "2026-09-28"), // ended before October: nothing
    c("2026-10-02", "2026-10-12"), // masuk and selesai in October, 10 days
    c("2026-10-15", null), // masuk, still active
    c("2026-10-20", "2026-11-03"), // masuk, active at the month's end
    c("2026-11-02", null), // after October: not counted at all
  ];

  it("counts a month the way the owner's sheet does", () => {
    const f = monthFigures(cases, oct);
    expect(f).toMatchObject({ total: 6, masuk: 3, selesai: 2, aktif: 2, outstanding: 2, workload: 5 });
    expect(f.selesaiRate).toBeCloseTo(2 / 3);
    // (23 days + 10 days) / 2
    expect(f.avgLeadDays).toBeCloseTo(16.5);
  });

  it("gives no rate or lead time for an empty month", () => {
    const f = monthFigures([], oct);
    expect(f).toMatchObject({ total: 0, masuk: 0, selesai: 0, selesaiRate: null, avgLeadDays: null });
  });
});

describe("shares and rankings", () => {
  const cases = [
    c("2026-10-01", null, { vendor: "Asus Service Center", vendorLocation: "out_of_town", brand: "ASUS" }),
    c("2026-10-02", null, { vendor: "ASUS  SERVICE CENTER", vendorLocation: "out_of_town", brand: "asus" }),
    c("2026-10-03", null, { vendor: "Agres Batam", vendorLocation: "in_town", brand: "Fantech", ownership: "store_stock" }),
    c("2026-10-04", null, { vendor: "Rexus", vendorLocation: null, brand: null }),
    c("2026-10-05", null),
  ];

  it("splits LKL and ITR, keeping unsent cases and unknown locations apart", () => {
    expect(locationShares(cases).map((s) => [s.key, s.count])).toEqual([
      ["out_of_town", 2],
      ["in_town", 1],
      ["unknown", 1],
      ["none", 1],
    ]);
    expect(ownershipShares(cases).map((s) => s.count)).toEqual([4, 1]);
  });

  it("ranks one vendor once however it was typed, and counts the unnamed apart", () => {
    const v = ranking(cases, (x) => x.vendor);
    expect(v.rows.map((r) => [r.label, r.count])).toEqual([
      ["ASUS SERVICE CENTER", 2],
      ["AGRES BATAM", 1],
      ["REXUS", 1],
    ]);
    expect(v.missing).toBe(1);
    expect(ranking(cases, (x) => x.brand).missing).toBe(2);
  });
});

describe("filters and months", () => {
  it("reads only known values, and filters by the case as it stands", () => {
    expect(readCaseFilter({ lokasi: "in_town", milik: "x", status: "finished" })).toEqual({ location: "in_town", ownership: undefined, status: "finished" });
    const open = c("2026-10-01", null, { vendorLocation: "in_town" });
    expect(matchesFilter(open, { status: "open", location: "in_town" })).toBe(true);
    expect(matchesFilter(open, { status: "finished" })).toBe(false);
    expect(matchesFilter(open, { ownership: "store_stock" })).toBe(false);
  });

  it("walks months across a year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03", "2026-02")).toEqual([]);
  });
});
