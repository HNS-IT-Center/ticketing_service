import { describe, expect, it } from "vitest";
import { resolveWeek, scheduleCell, weekOf } from "./store-schedule";

const tech = { id: "a", name: "Rianto", shift: "morning", workDays: ["Mon", "Tue"] };
const name = (id: string) => ({ a: "Rianto", b: "Mitchel" })[id] ?? id;

describe("weeks", () => {
  it("starts on Monday, in WIB", () => {
    expect(weekOf("2026-11-12").monday).toBe("2026-11-09");
    // 00:30 WIB on Monday 16 Nov is still Sunday in UTC.
    expect(resolveWeek(undefined, Date.parse("2026-11-15T17:30:00Z")).monday).toBe("2026-11-16");
    expect(resolveWeek("bukan", Date.parse("2026-11-12T03:00:00Z")).days).toHaveLength(7);
  });
});

describe("scheduleCell", () => {
  it("follows the weekly pattern", () => {
    expect(scheduleCell(tech, "2026-11-09", [], [], name)).toEqual({ kind: "shift", shift: "morning" });
    expect(scheduleCell(tech, "2026-11-11", [], [], name)).toEqual({ kind: "off" });
    expect(scheduleCell({ ...tech, workDays: null }, "2026-11-09", [], [], name)).toEqual({ kind: "unset" });
  });
  it("puts leave before a swap, and a swap before the pattern", () => {
    const leaves = [{ technicianId: "a", day: "2026-11-09", reason: "Sakit" }];
    const swaps = [
      { originalId: "a", overrideId: "b", day: "2026-11-10", shift: "noon" },
      { originalId: "b", overrideId: "a", day: "2026-11-11", shift: "noon" },
    ];
    expect(scheduleCell(tech, "2026-11-09", leaves, swaps, name)).toEqual({ kind: "leave", reason: "Sakit" });
    expect(scheduleCell(tech, "2026-11-10", leaves, swaps, name)).toEqual({ kind: "covered", by: "Mitchel" });
    expect(scheduleCell(tech, "2026-11-11", leaves, swaps, name)).toEqual({ kind: "covering", for: "Mitchel", shift: "noon" });
  });
});
