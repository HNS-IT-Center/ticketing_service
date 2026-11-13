import { describe, expect, it } from "vitest";
import {
  attention,
  backlogText,
  finishFacts,
  firstPaidFinishes,
  hoursText,
  periodTotals,
  storeSummaries,
  targetProgress,
  technicianSummaries,
  technicianTeams,
  typeShares,
  emptyByType,
  type ChargeIn,
  type FinishedTicketIn,
} from "./admin-dashboard";
import { periodRange, trendBuckets, trendRows } from "./trend";

// 13 Nov 2026, 14:00 in Batam (07:00 UTC).
const NOW = Date.parse("2026-11-13T07:00:00Z");
const wib = (iso: string) => Date.parse(`${iso}+07:00`);

function ticket(over: Partial<FinishedTicketIn> = {}): FinishedTicketIn {
  return {
    id: "t1",
    ticketType: "service",
    deviceType: "Laptop_Office",
    cleaningPackage: null,
    pointsExcluded: false,
    storeId: "s1",
    technicianId: "u1",
    charges: [],
    timeLogs: [],
    ...over,
  };
}
const line = (over: Partial<ChargeIn>): ChargeIn => ({ kind: "service_fee", quantity: 1, unit_price: 100_000, job_points: null, ...over });

describe("firstPaidFinishes", () => {
  it("counts a warranty claim once, at its handover to RMA, not again when the case closes done", () => {
    const got = firstPaidFinishes(
      [
        { ticketId: "c", ticketType: "warranty_claim", newStatus: "rma_process", at: 10 },
        { ticketId: "c", ticketType: "warranty_claim", newStatus: "done", at: 20 },
      ],
      new Set(),
    );
    expect([...got]).toEqual([["c", 10]]);
  });
  it("never takes a claim's closing done as its finish, even when the handover is outside the logs", () => {
    const got = firstPaidFinishes([{ ticketId: "c", ticketType: "warranty_claim", newStatus: "done", at: 20 }], new Set());
    expect(got.size).toBe(0);
  });
  it("keeps the first of two dones, and skips a ticket already paid before the window", () => {
    const got = firstPaidFinishes(
      [
        { ticketId: "a", ticketType: "service", newStatus: "done", at: 30 },
        { ticketId: "a", ticketType: "service", newStatus: "done", at: 5 },
        { ticketId: "b", ticketType: "service", newStatus: "done", at: 7 },
      ],
      new Set(["b"]),
    );
    expect([...got]).toEqual([["a", 5]]);
  });
});

describe("finishFacts", () => {
  it("adds the type's points to the Daftar Jasa points", () => {
    const f = finishFacts(ticket({ charges: [line({ job_points: 3, quantity: 2 })] }), NOW);
    expect(f.points).toBe(5 + 6);
  });
  it("gives a ticket whose points were taken off 0 points, but still counts its finish and takings", () => {
    const f = finishFacts(ticket({ pointsExcluded: true, charges: [line({ job_points: 3 })] }), NOW);
    expect(f.points).toBe(0);
    expect(f.takings).toBe(100_000);
  });
  it("sums price × quantity and counts unpriced lines apart instead of as 0", () => {
    const f = finishFacts(
      ticket({
        charges: [
          line({ kind: "part", quantity: 2, unit_price: 250_000 }),
          line({ kind: "external_service", unit_price: null }),
          line({ kind: "other", unit_price: null }),
        ],
      }),
      NOW,
    );
    expect(f.takings).toBe(500_000);
    expect(f.unpriced).toBe(2);
  });
  it("measures working time up to the finish, without pauses", () => {
    const at = wib("2026-11-13T12:00:00");
    const f = finishFacts(
      ticket({
        timeLogs: [
          { event: "START", created_at: new Date(wib("2026-11-13T09:00:00")).toISOString() },
          { event: "PAUSE", created_at: new Date(wib("2026-11-13T10:00:00")).toISOString() },
          { event: "RESUME", created_at: new Date(wib("2026-11-13T11:00:00")).toISOString() },
          // Reopened after the finish: other work.
          { event: "START", created_at: new Date(wib("2026-11-13T13:00:00")).toISOString() },
        ],
      }),
      at,
    );
    expect(f.workMs).toBe(2 * 3600_000);
  });
});

describe("the period on screen", () => {
  const range = periodRange("month", NOW);
  const created = [
    { at: wib("2026-11-02T10:00:00"), type: "service" as const, storeId: "s1" },
    { at: wib("2026-11-03T10:00:00"), type: "warranty_claim" as const, storeId: "s1" },
    { at: wib("2026-11-04T10:00:00"), type: "cleaning" as const, storeId: "s2" },
    { at: wib("2026-10-31T23:59:00"), type: "service" as const, storeId: "s1" },
  ];
  const finishes = [
    { ...finishFacts(ticket({ id: "a", charges: [line({ unit_price: null })] }), wib("2026-11-05T09:00:00")) },
    { ...finishFacts(ticket({ id: "b", storeId: "s2", technicianId: "u2", pointsExcluded: true }), wib("2026-11-06T09:00:00")) },
    { ...finishFacts(ticket({ id: "c" }), wib("2026-10-20T09:00:00")) },
  ];

  it("counts only this period so far, splitting October 31st 23:59 WIB into October", () => {
    expect(periodTotals(created, finishes, range)).toEqual({ created: 3, finished: 2, points: 5, takings: 0, unpriced: 1 });
  });

  it("splits it per store, with the type composition and the follow-ups", () => {
    const rows = storeSummaries(
      [
        { id: "s1", name: "Nagoya Hill" },
        { id: "s2", name: "Gateway" },
      ],
      created,
      finishes,
      range,
      new Map([["s1", 4]]),
    );
    expect(rows[0]).toMatchObject({ name: "Nagoya Hill", created: 2, finished: 1, unpriced: 1, followups: 4 });
    expect(rows[0].byType).toMatchObject({ service: 1, warranty_claim: 1 });
    expect(rows[1]).toMatchObject({ created: 1, finished: 1, followups: 0 });
  });

  it("ranks technicians by points, keeps one with nothing, and reads the target as the report does", () => {
    const rows = technicianSummaries(
      [
        { id: "u0", name: "Agus" },
        { id: "u1", name: "Budi" },
        { id: "u2", name: "Siti" },
      ],
      finishes,
      range,
      new Map([["u1", targetProgress(undefined, { jobs: 10, revenue: null, points: null, source: "default", since: "2026-11" })]]),
    );
    expect(rows.map((r) => [r.name, r.points, r.finished])).toEqual([
      ["Budi", 5, 1],
      ["Siti", 0, 1],
      ["Agus", 0, 0],
    ]);
    expect(rows[0].target).toEqual({ measure: "jobs", progress: { value: 0, target: 10, percent: 0, met: false } });
  });

  it("marks the running bucket by position: the last one holds now", () => {
    const rows = trendRows(trendBuckets("month", NOW), { created, finished: finishes, cancelled: [] });
    expect(rows.at(-1)!.key).toBe("2026-11-01");
    expect(rows.at(-1)!.unpriced).toBe(1);
    expect(rows.at(-2)!.created).toBe(1);
  });
});

describe("technicianTeams", () => {
  const m = (id: string, points: number) => ({ id, name: id, points, finished: 1, workMs: 0, target: null });
  it("makes one team per store in store order, keeps the ranking, and gathers technicians with no store", () => {
    const teams = technicianTeams(
      [
        { id: "s1", name: "Gateway" },
        { id: "s2", name: "Nagoya Hill" },
        { id: "s3", name: "Kosong" },
      ],
      [m("budi", 9), m("siti", 5), m("agus", 2), m("baru", 0)],
      new Map([
        ["budi", ["s1"]],
        ["siti", ["s1", "s2"]],
        ["agus", ["s2"]],
        ["baru", ["s-ditutup"]],
      ]),
    );
    expect(teams.map((t) => [t.name, t.members.map((x) => x.id), t.points])).toEqual([
      ["Gateway", ["budi", "siti"], 14],
      ["Nagoya Hill", ["siti", "agus"], 7],
      ["Belum ada toko", ["baru"], 0],
    ]);
  });
});

describe("targetProgress", () => {
  const row = { technician: { id: "u", name: "U" }, tickets: 4, jobs: 6, revenue: 0, unpriced: 0, points: 12, untyped: 0, byJob: [] };
  it("prefers the points target, then jobs, and has none without either", () => {
    expect(targetProgress(row, { jobs: 10, revenue: null, points: 20, source: "custom", since: "2026-11" })?.measure).toBe("points");
    expect(targetProgress(row, { jobs: 10, revenue: 5_000_000, points: null, source: "custom", since: "2026-11" })?.measure).toBe("jobs");
    expect(targetProgress(row, { jobs: null, revenue: 5_000_000, points: null, source: "custom", since: "2026-11" })).toBeNull();
  });
});

describe("attention", () => {
  it("counts today's lists and the distinct tickets per store", () => {
    const a = attention({
      stale: [
        { ticketId: "1", storeId: "s1", technician: null, urgency: "overdue" },
        { ticketId: "2", storeId: "s1", technician: "Budi", urgency: "warn" },
      ],
      pickup: [{ ticketId: "3", storeId: "s2", technician: "Siti", urgency: "ok" }],
      vendor: [],
      // Ticket 3 is on two lists: counted once for its store.
      billing: [{ ticketId: "3", storeId: "s2", technician: "Siti", urgency: "warn" }],
      code: [],
    });
    expect(a).toMatchObject({ unassigned: 1, staleOverdue: 1, pickup: 1, billing: 1 });
    expect(a.perStore.get("s1")).toBe(2);
    expect(a.perStore.get("s2")).toBe(1);
  });
});

describe("small helpers", () => {
  it("shares the composition in the fixed type order, leaving out empty types", () => {
    const by = { ...emptyByType(), service: 3, warranty_claim: 1 };
    expect(typeShares(by).map((s) => [s.type, s.percent])).toEqual([
      ["service", 75],
      ["warranty_claim", 25],
    ]);
    expect(typeShares(emptyByType())).toEqual([]);
  });
  it("words the backlog and the hours", () => {
    expect(backlogText(13, 4)).toBe("Tumpukan bertambah 9");
    expect(backlogText(2, 5)).toBe("Tumpukan berkurang 3");
    expect(backlogText(3, 3)).toBe("Tumpukan tetap");
    expect(hoursText(0)).toBe("0 j");
    expect(hoursText(45 * 60_000)).toBe("45 m");
    expect(hoursText(64 * 3600_000 + 5 * 60_000)).toBe("64 j 5 m");
  });
});
