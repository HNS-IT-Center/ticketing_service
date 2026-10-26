import { describe, it, expect } from "vitest";
import { summarizeTargets, type TargetLine } from "./technicians";

const budi = { id: "budi", name: "Budi" };
const siti = { id: "siti", name: "Siti" };
const line = (over: Partial<TargetLine>): TargetLine => ({
  ticketId: "t1",
  technicianId: "budi",
  jobId: "lcd",
  jobName: "Ganti LCD",
  quantity: 1,
  unitPrice: 150000,
  points: 2,
  ...over,
});

describe("summarizeTargets", () => {
  it("counts jobs by quantity, adds takings and points per technician", () => {
    const s = summarizeTargets(
      [budi, siti],
      [
        { ticketId: "t1", technicianId: "budi" },
        { ticketId: "t2", technicianId: "budi" },
        { ticketId: "t3", technicianId: "siti" },
      ],
      [
        line({ ticketId: "t1" }),
        line({ ticketId: "t2", jobId: "os", jobName: "Install Ulang OS", quantity: 2, unitPrice: 100000, points: 1 }),
        line({ ticketId: "t3", technicianId: "siti", unitPrice: null }),
      ]
    );
    const b = s.rows.find((r) => r.technician.id === "budi")!;
    expect(b).toMatchObject({ tickets: 2, jobs: 3, revenue: 150000 + 200000, points: 2 + 2, unpriced: 0 });
    expect(b.byJob).toEqual([
      { jobId: "os", name: "Install Ulang OS", count: 2 },
      { jobId: "lcd", name: "Ganti LCD", count: 1 },
    ]);
    const si = s.rows.find((r) => r.technician.id === "siti")!;
    // No price yet: the job and its points count, the takings wait.
    expect(si).toMatchObject({ tickets: 1, jobs: 1, revenue: 0, unpriced: 1, points: 2 });
    expect(s.totals).toEqual({ tickets: 3, jobs: 4, revenue: 350000, points: 6, unpriced: 1, untyped: 0 });
    expect(s.jobs).toEqual([
      { jobId: "lcd", name: "Ganti LCD", count: 2 },
      { jobId: "os", name: "Install Ulang OS", count: 2 },
    ]);
  });

  it("keeps a typed line out of the per-job counts, takings and points", () => {
    const s = summarizeTargets([budi], [{ ticketId: "t1", technicianId: "budi" }], [line({ jobId: null, jobName: "jasa ketik" })]);
    expect(s.rows[0]).toMatchObject({ jobs: 0, untyped: 1, revenue: 0, points: 0, byJob: [] });
  });

  it("shows a technician with no work as zeros, and ranks by points, then jobs", () => {
    const s = summarizeTargets(
      [budi, siti, { id: "agus", name: "Agus" }],
      [{ ticketId: "t1", technicianId: "siti" }],
      [line({ technicianId: "siti", points: 5 })]
    );
    expect(s.rows.map((r) => r.technician.name)).toEqual(["Siti", "Agus", "Budi"]);
    expect(s.rows[1]).toMatchObject({ tickets: 0, jobs: 0, points: 0 });
  });

  it("keeps work by someone no longer listed instead of dropping it", () => {
    const s = summarizeTargets([], [{ ticketId: "t1", technicianId: "gone" }], [line({ technicianId: "gone" })]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ tickets: 1, jobs: 1 });
  });
});
