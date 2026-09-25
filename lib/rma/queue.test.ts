import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { RmaStatus } from "@prisma/client";

// lib/rma/queue.ts pulls in lib/db.ts, which is server-only.
vi.mock("server-only", () => ({}));

const { RMA_STAGE_SLA, RMA_QUEUE_STATUSES, rmaSeverity, VENDOR_WARNING_DAYS, VENDOR_OVERDUE_DAYS, getRmaQueue } =
  await import("./queue");

const ALL_RMA_STATUSES: RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "closed",
  "cancelled",
];

describe("RMA_STAGE_SLA", () => {
  it("covers every status, so a new one cannot slip through unmeasured", () => {
    for (const status of ALL_RMA_STATUSES) {
      expect(RMA_STAGE_SLA[status], status).toBeDefined();
    }
  });

  it("always warns before it escalates", () => {
    for (const status of ALL_RMA_STATUSES) {
      const { warning, overdue } = RMA_STAGE_SLA[status];
      expect(overdue, status).toBeGreaterThanOrEqual(warning);
    }
  });

  it("gives every queued stage a finite target", () => {
    for (const status of RMA_QUEUE_STATUSES) {
      expect(Number.isFinite(RMA_STAGE_SLA[status].overdue), status).toBe(true);
    }
  });

  it("never nags about a closed or cancelled case", () => {
    for (const status of ["closed", "cancelled"] as const) {
      expect(rmaSeverity(status, 3650)).toBe("ok");
    }
  });

  it("keeps the vendor stages on the shared vendor constants", () => {
    for (const status of ["submitted_to_vendor", "in_vendor_process"] as const) {
      expect(RMA_STAGE_SLA[status], status).toEqual({
        warning: VENDOR_WARNING_DAYS,
        overdue: VENDOR_OVERDUE_DAYS,
      });
    }
  });

  it("is stricter about a unit sitting on the desk than one sitting at a vendor", () => {
    // The desk controls its own stages; the vendor's pace it does not.
    for (const deskStage of ["pending_verification", "verified", "unit_received"] as const) {
      expect(RMA_STAGE_SLA[deskStage].overdue, deskStage).toBeLessThan(VENDOR_OVERDUE_DAYS);
    }
  });
});

describe("rmaSeverity", () => {
  it("is ok below the warning threshold", () => {
    for (const status of RMA_QUEUE_STATUSES) {
      expect(rmaSeverity(status, 0), status).toBe("ok");
      expect(rmaSeverity(status, RMA_STAGE_SLA[status].warning - 1), status).toBe("ok");
    }
  });

  it("warns exactly on the warning threshold", () => {
    for (const status of RMA_QUEUE_STATUSES) {
      const { warning, overdue } = RMA_STAGE_SLA[status];
      // Only meaningful where the two thresholds differ.
      if (warning < overdue) {
        expect(rmaSeverity(status, warning), status).toBe("warning");
      }
    }
  });

  it("escalates exactly on the overdue threshold, and stays there", () => {
    for (const status of RMA_QUEUE_STATUSES) {
      const { overdue } = RMA_STAGE_SLA[status];
      expect(rmaSeverity(status, overdue), status).toBe("overdue");
      expect(rmaSeverity(status, overdue + 365), status).toBe("overdue");
    }
  });

  it("never goes backwards as the days pile up", () => {
    const rank = { ok: 0, warning: 1, overdue: 2 } as const;
    for (const status of RMA_QUEUE_STATUSES) {
      let previous = 0;
      for (let day = 0; day <= 40; day++) {
        const current = rank[rmaSeverity(status, day)];
        expect(current, `${status} day ${day}`).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    }
  });
});

describe("getRmaQueue stats — internal consistency", () => {
  // Runs against whatever the local database holds. The assertions are
  // relationships between the numbers, so they hold for any data.
  let rows: Awaited<ReturnType<typeof getRmaQueue>>["rows"];
  let stats: Awaited<ReturnType<typeof getRmaQueue>>["stats"];

  beforeAll(async () => {
    ({ rows, stats } = await getRmaQueue());
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("counts every queued row as active", () => {
    expect(stats.active).toBe(rows.length);
  });

  it("never reports more late-at-vendor cases than cases at a vendor", () => {
    // `submitted_at` stays set after a case leaves the vendor stages, so
    // counting on it alone once made the "Di Vendor" card claim two late cases
    // while showing one case.
    expect(stats.overdue).toBeLessThanOrEqual(stats.atVendor);
  });

  it("keeps the stage buckets inside the active total", () => {
    expect(stats.needsAction + stats.atVendor).toBeLessThanOrEqual(stats.active);
  });

  it("keeps overdue and warning disjoint and inside the active total", () => {
    expect(stats.pastDue + stats.warning).toBeLessThanOrEqual(stats.active);
  });

  it("agrees with the per-row severity it derives from", () => {
    expect(stats.pastDue).toBe(rows.filter((r) => r.severity === "overdue").length);
    expect(stats.warning).toBe(rows.filter((r) => r.severity === "warning").length);
  });

  it("derives the month's net from its own intake and closures", () => {
    expect(stats.netThisMonth).toBe(stats.openedThisMonth - stats.closedThisMonth);
  });
});
