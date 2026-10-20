import { describe, it, expect } from "vitest";
import { defaultTarget, progress, readTargetForm, targetFor, type TargetRow } from "./targets";

const row = (o: Partial<TargetRow>): TargetRow => ({
  scope: "default",
  effective_month: "2026-10",
  jobs: null,
  revenue: null,
  points: null,
  use_default: false,
  ...o,
});

describe("targetFor", () => {
  const rows = [
    row({ effective_month: "2026-09", jobs: 30, points: 40 }),
    row({ effective_month: "2026-11", jobs: 40, points: 50 }),
    row({ scope: "siti", effective_month: "2026-10", jobs: 15 }),
    row({ scope: "siti", effective_month: "2026-12", use_default: true }),
  ];

  it("uses the default in force for the month — a later change does not reach back", () => {
    expect(targetFor(rows, "budi", "2026-10")).toMatchObject({ jobs: 30, points: 40, source: "default", since: "2026-09" });
    expect(targetFor(rows, "budi", "2026-11")).toMatchObject({ jobs: 40, points: 50, since: "2026-11" });
  });

  it("uses a technician's own target from its month, and the default before it", () => {
    expect(targetFor(rows, "siti", "2026-09")).toMatchObject({ jobs: 30, source: "default" });
    expect(targetFor(rows, "siti", "2026-11")).toMatchObject({ jobs: 15, points: null, source: "custom", since: "2026-10" });
  });

  it("sends a technician back to the default when their row says so", () => {
    expect(targetFor(rows, "siti", "2026-12")).toMatchObject({ jobs: 40, source: "default" });
  });

  it("has no target before any was set, or after the default was cleared", () => {
    expect(targetFor(rows, "budi", "2026-08")).toMatchObject({ source: "none", jobs: null });
    const cleared = [...rows, row({ effective_month: "2027-01" })];
    expect(defaultTarget(cleared, "2027-01")).toMatchObject({ source: "none" });
    expect(defaultTarget(cleared, "2026-12")).toMatchObject({ source: "default", jobs: 40 });
  });
});

describe("progress", () => {
  it("rounds down, caps nothing, and says when the target is met", () => {
    expect(progress(10, 40)).toEqual({ value: 10, target: 40, percent: 25, met: false });
    expect(progress(45, 40)).toMatchObject({ percent: 112, met: true });
    expect(progress(39, 40)).toMatchObject({ percent: 97, met: false });
  });
  it("has nothing to show without a target", () => {
    expect(progress(5, null)).toBeNull();
    expect(progress(5, 0)).toBeNull();
  });
});

describe("readTargetForm", () => {
  const form = (o: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(o)) fd.set(k, v);
    return fd;
  };
  it("reads the three measures; empty means no target", () => {
    expect(readTargetForm(form({ jobs: "40", revenue: "Rp 5.000.000", points: "" }))).toEqual({
      ok: true,
      value: { jobs: 40, revenue: 5000000, points: null },
    });
  });
  it("refuses fractions, negatives and words", () => {
    expect(readTargetForm(form({ jobs: "1.5" }))).toMatchObject({ ok: false });
    expect(readTargetForm(form({ points: "-3" }))).toMatchObject({ ok: false });
    expect(readTargetForm(form({ revenue: "lima juta" }))).toMatchObject({ ok: false });
  });
});
