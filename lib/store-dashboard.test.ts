import { describe, expect, it } from "vitest";
import {
  byCategory,
  byTechnician,
  caseCategory,
  formatDuration,
  intakeSeries,
  oldestUnfinished,
  parsePeriod,
  periodDays,
  pipelineStage,
  scheduledDays,
  type FinishedTicket,
  type OpenTicket,
} from "./store-dashboard";

// 2026-11-09 10:00 WIB (a Monday) = 03:00 UTC.
const NOW = Date.parse("2026-11-09T03:00:00Z");
const H = 3600_000;

describe("parsePeriod", () => {
  it("defaults to this month in WIB", () => {
    const p = parsePeriod({}, NOW);
    expect(p.preset).toBe("month");
    expect([p.fromDay, p.toDay]).toEqual(["2026-11-01", "2026-11-30"]);
    expect(p.start.toISOString()).toBe("2026-10-31T17:00:00.000Z"); // midnight in Batam
    expect(p.end.toISOString()).toBe("2026-11-30T17:00:00.000Z");
  });

  it("knows today and the week from Monday, in WIB rather than UTC", () => {
    // 23:30 WIB on Sunday 8 Nov is still the 8th in Batam though the 8th in UTC too;
    // 00:30 WIB on Monday 9 Nov is the 8th in UTC.
    const justAfterMidnight = Date.parse("2026-11-08T17:30:00Z");
    expect(parsePeriod({ period: "today" }, justAfterMidnight).fromDay).toBe("2026-11-09");
    const w = parsePeriod({ period: "week" }, Date.parse("2026-11-12T03:00:00Z"));
    expect([w.fromDay, w.toDay]).toEqual(["2026-11-09", "2026-11-15"]);
  });

  it("takes a range, swaps it when backwards, and falls back on a broken one", () => {
    expect(parsePeriod({ period: "range", from: "2026-11-05", to: "2026-11-01" }, NOW)).toMatchObject({
      preset: "range",
      fromDay: "2026-11-01",
      toDay: "2026-11-05",
    });
    expect(parsePeriod({ period: "range", from: "kemarin", to: "2026-11-01" }, NOW).preset).toBe("month");
    expect(parsePeriod({ period: "tahun" }, NOW).preset).toBe("month");
  });

  it("lists the days up to today only", () => {
    expect(periodDays(parsePeriod({}, NOW), NOW)).toHaveLength(9);
  });
});

describe("caseCategory", () => {
  it("splits service by the part replaced", () => {
    expect(caseCategory("service", [])).toMatchObject({ key: "service_other" });
    expect(caseCategory("service", ["battery", "battery"])).toMatchObject({ key: "part_battery", group: "parts" });
    expect(caseCategory("service", ["lcd", "keyboard"])).toMatchObject({ key: "parts_multiple", group: "parts" });
    expect(caseCategory("pc_build", ["lcd"])).toEqual({ key: "pc_build", label: "Rakit PC" });
  });
});

const finished = (over: Partial<FinishedTicket>): FinishedTicket => ({
  id: Math.random().toString(36),
  technicianId: "t1",
  ticketType: "service",
  parts: [],
  createdAt: new Date(NOW - 48 * H),
  finishedAt: new Date(NOW),
  timeLogs: [],
  ...over,
});
const at = (h: number) => new Date(NOW - h * H).toISOString();

describe("byCategory", () => {
  const tickets = [
    // 1 h worked, a 1 h pause not counted.
    finished({ parts: ["battery"], timeLogs: [{ event: "START", created_at: at(4) }, { event: "PAUSE", created_at: at(3) }, { event: "RESUME", created_at: at(2) }, { event: "DONE", created_at: at(2) }] }),
    finished({ parts: ["lcd"], timeLogs: [{ event: "START", created_at: at(3) }, { event: "DONE", created_at: at(0) }] }),
    finished({ ticketType: "cleaning" }), // no timer: counted, not timed
  ];

  it("puts the part rows under Ganti sparepart, which sums them", () => {
    const rows = byCategory(tickets);
    expect(rows.map((r) => r.key)).toEqual(["parts", "part_battery", "part_lcd", "cleaning"]);
    expect(rows[0]).toMatchObject({ count: 2, timed: 2, avgWorkMs: 2 * H });
    expect(rows[1]).toMatchObject({ avgWorkMs: 1 * H, avgLeadMs: 48 * H });
    expect(rows[3]).toMatchObject({ count: 1, timed: 0, avgWorkMs: null });
  });

  it("stops measuring at the finish, so a reopened ticket's later work is left out", () => {
    const t = finished({
      finishedAt: new Date(NOW - 2 * H),
      timeLogs: [{ event: "START", created_at: at(3) }, { event: "DONE", created_at: at(2) }, { event: "START", created_at: at(1) }],
    });
    expect(byCategory([t])[0].avgWorkMs).toBe(1 * H);
  });
});

describe("scheduledDays", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-07", "2026-11-08"]; // Mon Tue Wed Sat Sun
  const none = new Set<string>();
  it("counts work days, less leave and swaps away, plus swaps in", () => {
    expect(scheduledDays(days, { workDays: ["Mon", "Tue", "Wed"], leave: none, swappedAway: none, swappedIn: none })).toBe(3);
    expect(
      scheduledDays(days, {
        workDays: ["Mon", "Tue", "Wed"],
        leave: new Set(["2026-11-03"]),
        swappedAway: new Set(["2026-11-04"]),
        swappedIn: new Set(["2026-11-08"]),
      }),
    ).toBe(2);
  });
  it("is null without a schedule", () => {
    expect(scheduledDays(days, { workDays: null, leave: none, swappedAway: none, swappedIn: none })).toBeNull();
  });
});

const open = (over: Partial<OpenTicket>): OpenTicket => ({
  id: Math.random().toString(36),
  code: "NGH-000001",
  status: "on_progress",
  ticketType: "service",
  technicianId: "t1",
  technicianName: "Rianto",
  deviceName: null,
  createdAt: new Date(NOW - 10 * 24 * H),
  paused: false,
  ...over,
});

describe("open tickets", () => {
  it("places each status in one stage, and closed ones in none", () => {
    expect(pipelineStage(open({ status: "waiting", technicianId: null }))).toBe("unassigned");
    expect(pipelineStage(open({ status: "waiting" }))).toBe("queued");
    expect(pipelineStage(open({ paused: true }))).toBe("paused");
    expect(pipelineStage(open({ status: "rma_process" }))).toBe("rma");
    expect(pipelineStage(open({ status: "ready_for_pickup" }))).toBe("handover");
    expect(pipelineStage(open({ status: "completed" }))).toBeNull();
  });

  it("lists the longest-waiting unfinished tickets first, with their age", () => {
    const list = oldestUnfinished(
      [open({ code: "B", createdAt: new Date(NOW - 2 * 24 * H) }), open({ code: "A" }), open({ code: "C", status: "done" })],
      NOW,
    );
    expect(list.map((t) => [t.code, t.ageDays])).toEqual([["A", 10], ["B", 2]]);
  });
});

describe("byTechnician", () => {
  it("divides by scheduled days and counts what is on the bench", () => {
    const none = new Set<string>();
    const rows = byTechnician(
      [
        { id: "t1", name: "Rianto", schedule: { workDays: ["Mon"], leave: none, swappedAway: none, swappedIn: none } },
        { id: "t2", name: "Mitchel", schedule: { workDays: null, leave: none, swappedAway: none, swappedIn: none } },
      ],
      [finished({}), finished({})],
      [open({}), open({ paused: true }), open({ technicianId: "t2", status: "waiting" })],
      ["2026-11-02", "2026-11-09"],
    );
    expect(rows[0]).toMatchObject({ id: "t1", finished: 2, scheduledDays: 2, perDay: 1, active: 2, paused: 1 });
    expect(rows[1]).toMatchObject({ id: "t2", finished: 0, perDay: null, perDayBasis: null, active: 1 });
  });

  it("falls back to the days a technician finished something when there is no schedule", () => {
    const none = new Set<string>();
    const [row] = byTechnician(
      [{ id: "t1", name: "Rianto", schedule: { workDays: null, leave: none, swappedAway: none, swappedIn: none } }],
      [finished({}), finished({}), finished({ finishedAt: new Date(NOW - 24 * H) })],
      [],
      ["2026-11-08", "2026-11-09"],
    );
    expect(row).toMatchObject({ perDay: 1.5, perDayBasis: "active", activeDays: 2 });
  });
});

describe("intakeSeries", () => {
  it("buckets by WIB day, per type", () => {
    const series = intakeSeries(
      [
        { createdAt: new Date("2026-11-01T18:00:00Z"), ticketType: "service" }, // 2 Nov 01:00 WIB
        { createdAt: new Date("2026-11-02T03:00:00Z"), ticketType: "cleaning" },
      ],
      ["2026-11-01", "2026-11-02"],
    );
    expect(series.map((b) => [b.key, b.total, b.counts.service, b.counts.cleaning])).toEqual([
      ["2026-11-01", 0, 0, 0],
      ["2026-11-02", 2, 1, 1],
    ]);
  });
  it("goes monthly past two months", () => {
    const days = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 8, 1) + i * 24 * H).toISOString().slice(0, 10));
    expect(intakeSeries([], days).map((b) => b.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
});

describe("formatDuration", () => {
  it.each([
    [null, "—"],
    [20_000, "< 1 m"],
    [40 * 60_000, "40 m"],
    [85 * 60_000, "1 j 25 m"],
    [3.4 * 24 * H, "3,4 hari"],
  ])("%s → %s", (ms, want) => expect(formatDuration(ms)).toBe(want));
});
