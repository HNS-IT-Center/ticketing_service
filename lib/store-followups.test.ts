import { describe, expect, it } from "vitest";
import { billingGap, daysSince, enteredStatusAt, isFollowupKind, urgencyOf } from "./store-followups";

describe("store follow-ups", () => {
  it("grades by the kind's own thresholds", () => {
    expect(urgencyOf("pickup", 2)).toBe("ok");
    expect(urgencyOf("pickup", 3)).toBe("warn");
    expect(urgencyOf("pickup", 7)).toBe("overdue");
    expect(urgencyOf("vendor", 7)).toBe("warn");
    expect(urgencyOf("vendor", 14)).toBe("overdue");
  });

  it("dates a status from the newest log into it, else the fallback", () => {
    const old = new Date("2026-10-01T00:00:00Z");
    const back = new Date("2026-10-05T00:00:00Z");
    const fallback = new Date("2026-10-09T00:00:00Z");
    const logs = [
      { new_status: "done" as const, created_at: old },
      { new_status: "done" as const, created_at: back },
      { new_status: "waiting" as const, created_at: fallback },
    ];
    expect(enteredStatusAt("done", logs, fallback)).toEqual(back);
    expect(enteredStatusAt("ready_for_pickup", logs, fallback)).toEqual(fallback);
    expect(daysSince(back, Date.parse("2026-10-08T12:00:00Z"))).toBe(3);
  });

  it("names the DRAF reasons a person can fix", () => {
    expect(billingGap([])).toBe("Belum ada biaya yang dicatat");
    expect(billingGap([{ unit_price: 50000 }, { unit_price: null }])).toBe("1 baris belum ada harga jual");
    expect(billingGap([{ unit_price: 0 }])).toBeNull();
  });

  it("knows its kinds", () => {
    expect(isFollowupKind("pickup")).toBe(true);
    expect(isFollowupKind("lain")).toBe(false);
    expect(isFollowupKind(undefined)).toBe(false);
  });
});
