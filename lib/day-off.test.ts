import { describe, expect, it } from "vitest";
import {
  clashDays,
  coveringOn,
  dayOffProblem,
  daysOffOf,
  leaveFactor,
  listDays,
  readWorkDays,
  spread,
  weekdayOf,
  workDaysFrom,
  type CoverRule,
} from "./day-off";
import { scaleTarget, type MonthTarget } from "./reports/targets";
import { scheduleCell } from "./store-schedule";

describe("days off are the complement of work_days", () => {
  it("reads a stored pattern safely, in week order", () => {
    expect(readWorkDays(["Fri", "Mon", "Mon", "Xyz", 3])).toEqual(["Mon", "Fri"]);
    expect(readWorkDays(null)).toBeNull();
    expect(readWorkDays([])).toBeNull();
  });

  it("round-trips days off and work days", () => {
    expect(daysOffOf(["Mon", "Tue", "Wed", "Thu", "Fri"])).toEqual(["Sat", "Sun"]);
    expect(workDaysFrom(["Sun", "Wed"])).toEqual(["Mon", "Tue", "Thu", "Fri", "Sat"]);
    expect(daysOffOf(null)).toBeNull();
  });

  it("names the days in Indonesian", () => {
    expect(listDays(["Sat", "Sun"])).toBe("Sabtu & Minggu");
    expect(listDays(["Mon", "Wed", "Fri"])).toBe("Senin, Rabu & Jumat");
    expect(weekdayOf("2026-11-19")).toBe("Thu");
  });
});

describe("dayOffProblem", () => {
  const ok = { daysOff: ["Sat"], replacementId: null, note: "" };
  it("accepts one to three known days", () => {
    expect(dayOffProblem("t1", ok)).toBeNull();
    expect(dayOffProblem("t1", { ...ok, daysOff: ["Fri", "Sat", "Sun"] })).toBeNull();
  });
  it("refuses none, more than three, unknown days, self as replacement and a long note", () => {
    expect(dayOffProblem("t1", { ...ok, daysOff: [] })).toMatch(/minimal satu/);
    expect(dayOffProblem("t1", { ...ok, daysOff: ["Mon", "Tue", "Wed", "Thu"] })).toMatch(/Maksimal 3/);
    expect(dayOffProblem("t1", { ...ok, daysOff: ["Sabtu"] })).toMatch(/tidak dikenal/);
    expect(dayOffProblem("t1", { ...ok, replacementId: "t1" })).toMatch(/orang yang sama/);
    expect(dayOffProblem("t1", { ...ok, note: "x".repeat(501) })).toMatch(/500/);
  });
});

describe("cover and spread", () => {
  it("warns when the replacement is off the same day", () => {
    expect(clashDays(["Sat", "Sun"], ["Sun"])).toEqual(["Sun"]);
    expect(clashDays(["Sat"], null)).toEqual([]);
  });

  it("counts who is off per weekday", () => {
    const s = spread([["Mon", "Tue", "Wed", "Thu", "Fri"], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], null]);
    expect(s.Sun).toBe(2);
    expect(s.Sat).toBe(1);
    expect(s.Mon).toBe(0);
  });

  it("finds whom a technician covers on a day, only on the colleague's day off", () => {
    const rules: CoverRule[] = [{ technicianId: "a", technicianName: "Ani", replacementId: "b", workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] }];
    expect(coveringOn("b", "2026-11-21", rules).map((r) => r.technicianName)).toEqual(["Ani"]); // Saturday
    expect(coveringOn("b", "2026-11-20", rules)).toEqual([]); // Friday: Ani works
    expect(coveringOn("c", "2026-11-21", rules)).toEqual([]);
  });

  it("shows the replacement on the calendar: off with its name, and covering on the other row", () => {
    const tech = { id: "a", name: "Ani", shift: "morning", workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] };
    const other = { id: "b", name: "Budi", shift: "noon", workDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
    const dayOff = { replacementOf: (id: string) => (id === "a" ? "Budi" : null), coveringOn: (id: string, day: string) => (id === "b" && day === "2026-11-21" ? ["Ani"] : []) };
    const name = () => "x";
    expect(scheduleCell(tech, "2026-11-21", [], [], name, dayOff)).toEqual({ kind: "off", by: "Budi" });
    expect(scheduleCell(other, "2026-11-22", [], [], name, dayOff)).toEqual({ kind: "off", by: null });
    expect(scheduleCell(other, "2026-11-21", [], [], name, dayOff)).toEqual({ kind: "shift", shift: "noon", covers: ["Ani"] });
    // A replacement whose own pattern is not set still shows the cover.
    expect(scheduleCell({ ...other, workDays: null }, "2026-11-21", [], [], name, dayOff)).toEqual({ kind: "shift", shift: "noon", covers: ["Ani"] });
    expect(scheduleCell({ ...other, workDays: null }, "2026-11-20", [], [], name, dayOff)).toEqual({ kind: "unset" });
    // Leave still wins over the pattern.
    expect(scheduleCell(other, "2026-11-21", [{ technicianId: "b", day: "2026-11-21", reason: null }], [], name, dayOff)).toEqual({ kind: "leave", reason: null });
  });
});

describe("leave reduces the monthly target", () => {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

  it("counts scheduled days and leave on working days only", () => {
    // November 2026: 21 weekdays. Leave on a Friday counts, on a Saturday does not.
    const f = leaveFactor([...weekdays], ["2026-11-20", "2026-11-21", "2026-10-30"], "2026-11");
    expect(f).toEqual({ scheduled: 21, leave: 1, factor: 20 / 21 });
  });

  it("keeps the whole target for a technician without a pattern", () => {
    expect(leaveFactor(null, ["2026-11-20"], "2026-11").factor).toBe(1);
  });

  it("scales every measure and says by how many days", () => {
    const t: MonthTarget = { jobs: 42, revenue: 2_100_000, points: null, source: "default", since: "2026-10" };
    const scaled = scaleTarget(t, { scheduled: 21, leave: 3, factor: 18 / 21 });
    expect(scaled).toMatchObject({ jobs: 36, revenue: 1_800_000, points: null, leaveDays: 3, source: "default" });
    expect(scaleTarget(t, undefined)).toMatchObject({ jobs: 42, leaveDays: 0 });
    expect(scaleTarget(t, { scheduled: 21, leave: 0, factor: 1 })).toMatchObject({ jobs: 42, leaveDays: 0 });
  });
});
