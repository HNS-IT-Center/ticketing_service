import { describe, expect, it } from "vitest";
import { activityWhere, wibDayStart } from "./activity-list";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_AREAS,
  activityEntityHref,
  activityLabel,
  actionsInArea,
  ticketStatusText,
} from "./activity-catalog";

describe("wibDayStart", () => {
  it("is midnight in Batam, not on the server's clock", () => {
    expect(wibDayStart("2026-11-04")?.toISOString()).toBe("2026-11-03T17:00:00.000Z");
    expect(wibDayStart("4/11/2026")).toBeNull();
    expect(wibDayStart(undefined)).toBeNull();
  });
});

describe("activityWhere", () => {
  it("is everything when nothing is asked", () => {
    expect(activityWhere({})).toEqual({ where: {}, isFiltered: false });
  });

  it("ignores an area or a date it cannot read instead of emptying the page", () => {
    expect(activityWhere({ area: "nonsense", from: "kemarin" }).isFiltered).toBe(false);
  });

  it("selects an area's actions, one user, and a WIB range that includes the last day", () => {
    const { where } = activityWhere({ q: " NGW-0001 ", area: "master", actor: "u1", from: "2026-11-01", to: "2026-11-04" });
    const and = where.AND as Record<string, unknown>[];
    expect(JSON.stringify(and[0])).toContain('"contains":"NGW-0001"');
    expect(and[1]).toEqual({ action: { in: actionsInArea("master") } });
    expect(and[2]).toEqual({ actor_id: "u1" });
    expect(and[3]).toEqual({
      created_at: { gte: new Date("2026-10-31T17:00:00Z"), lt: new Date("2026-11-04T17:00:00Z") },
    });
  });
});

describe("the catalogue", () => {
  it("puts every action in a known area, and every area has one", () => {
    for (const [action, info] of Object.entries(ACTIVITY_ACTIONS)) {
      expect(Object.keys(ACTIVITY_AREAS), action).toContain(info.area);
      expect(action.split(".")).toHaveLength(2);
    }
    for (const area of Object.keys(ACTIVITY_AREAS) as (keyof typeof ACTIVITY_AREAS)[]) {
      expect(actionsInArea(area).length, area).toBeGreaterThan(0);
    }
  });

  it("reads a removed action as written, and links only what has a page", () => {
    expect(activityLabel("vendor.delete")).toBe("Hapus vendor");
    expect(activityLabel("lama.sekali")).toBe("lama.sekali");
    expect(activityEntityHref("ticket", "t1")).toBe("/admin/tickets/t1");
    expect(activityEntityHref("vendor", "v1")).toBeNull();
    expect(activityEntityHref("ticket", null)).toBeNull();
  });

  it("names statuses as staff read them", () => {
    expect(ticketStatusText("on_progress")).not.toBe("on_progress");
    expect(ticketStatusText("bukan_status")).toBe("bukan_status");
  });
});
