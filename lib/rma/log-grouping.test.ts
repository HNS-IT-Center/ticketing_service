import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatDayLabel,
  formatGap,
  formatStageAge,
  formatTimeOfDay,
  groupByDay,
  logDayKey,
  parseDateRange,
} from "./log-grouping";

/** Jakarta is UTC+7, so 17:00 UTC is already the next day in the shop. */
const utc = (iso: string) => new Date(iso);

describe("logDayKey", () => {
  it("files an instant under the shop's calendar day, not the server's", () => {
    // 2026-10-02 23:30 in Batam.
    expect(logDayKey(utc("2026-10-02T16:30:00Z"))).toBe("2026-10-02");
  });

  it("rolls over at midnight Jakarta, seven hours before midnight UTC", () => {
    expect(logDayKey(utc("2026-10-02T16:59:59Z"))).toBe("2026-10-02");
    expect(logDayKey(utc("2026-10-02T17:00:00Z"))).toBe("2026-10-03");
  });

  it("keeps a late-evening event with the day it was worked, not the next one", () => {
    // The real failure this guards: an 18:24 WIB event is 11:24 UTC and would
    // key the same either way, but a 23:30 one would not.
    expect(logDayKey(utc("2026-10-02T11:24:19Z"))).toBe("2026-10-02");
  });
});

describe("formatDayLabel", () => {
  it("names the weekday in Indonesian", () => {
    // 2 October 2026 is a Friday.
    expect(formatDayLabel("2026-10-02")).toContain("Jumat");
    expect(formatDayLabel("2026-10-02")).toContain("Oktober");
    expect(formatDayLabel("2026-10-02")).toContain("2026");
  });

  it("does not drift a day when read back in the shop's zone", () => {
    expect(formatDayLabel("2026-09-29")).toContain("29");
    expect(formatDayLabel("2026-09-29")).toContain("Selasa");
  });
});

describe("formatTimeOfDay", () => {
  it("shows the shop's wall clock", () => {
    expect(formatTimeOfDay(utc("2026-10-02T11:24:19Z"))).toBe("18:24");
  });
});

describe("formatGap", () => {
  it("uses seconds below a minute", () => {
    expect(formatGap(utc("2026-09-29T09:38:36Z"), utc("2026-09-29T09:38:43Z"))).toBe("7 detik");
  });

  it("never says 0 detik for two events the same second", () => {
    const at = utc("2026-09-29T09:38:43Z");
    expect(formatGap(at, at)).toBe("1 detik");
  });

  it("uses minutes below an hour", () => {
    expect(formatGap(utc("2026-09-29T09:42:42Z"), utc("2026-09-29T10:04:19Z"))).toBe("22 menit");
  });

  it("uses hours below a day", () => {
    expect(formatGap(utc("2026-10-02T03:58:04Z"), utc("2026-10-02T11:22:55Z"))).toBe("7 jam");
  });

  it("uses whole days beyond that, rounded down", () => {
    expect(formatGap(utc("2026-09-29T09:42:42Z"), utc("2026-10-02T11:22:55Z"))).toBe("3 hari");
  });

  it("treats a backwards pair as no time at all rather than a negative", () => {
    expect(formatGap(utc("2026-10-02T11:00:00Z"), utc("2026-10-02T10:00:00Z"))).toBe("1 detik");
  });
});

describe("formatStageAge", () => {
  it("says today rather than 0 hari", () => {
    expect(formatStageAge(utc("2026-10-03T01:00:00Z"), utc("2026-10-03T09:00:00Z"))).toBe(
      "Masuk tahap ini hari ini"
    );
  });

  it("counts whole days once one has passed", () => {
    expect(formatStageAge(utc("2026-09-30T09:00:00Z"), utc("2026-10-03T09:00:00Z"))).toBe(
      "3 hari di tahap ini"
    );
  });
});

describe("daysBetween", () => {
  it("floors, and never goes negative", () => {
    expect(daysBetween(utc("2026-10-01T00:00:00Z"), utc("2026-10-03T23:00:00Z"))).toBe(2);
    expect(daysBetween(utc("2026-10-03T00:00:00Z"), utc("2026-10-01T00:00:00Z"))).toBe(0);
  });
});

describe("parseDateRange", () => {
  it("builds both boundaries in the shop's time zone, not the server's", () => {
    const range = parseDateRange("2026-10-02", "2026-10-02");
    // Midnight in Batam is 17:00 UTC the day before.
    expect(range?.gte?.toISOString()).toBe("2026-10-01T17:00:00.000Z");
    expect(range?.lt?.toISOString()).toBe("2026-10-02T17:00:00.000Z");
  });

  it("is half-open, so the closing day's last second is inside it", () => {
    const range = parseDateRange("2026-10-02", "2026-10-02");
    const lastSecond = utc("2026-10-02T16:59:59Z"); // 23:59:59 in Batam
    expect(range!.gte!.getTime()).toBeLessThanOrEqual(lastSecond.getTime());
    expect(range!.lt!.getTime()).toBeGreaterThan(lastSecond.getTime());
  });

  it("accepts one open side", () => {
    expect(parseDateRange("2026-10-02", undefined)?.lt).toBeUndefined();
    expect(parseDateRange(undefined, "2026-10-02")?.gte).toBeUndefined();
  });

  it("reads a reversed pair as the range the person drew", () => {
    const reversed = parseDateRange("2026-10-03", "2026-10-01");
    const forward = parseDateRange("2026-10-01", "2026-10-03");
    expect(reversed).toEqual(forward);
  });

  it("returns undefined when neither side is a date, so the query keeps no key", () => {
    expect(parseDateRange(undefined, undefined)).toBeUndefined();
    expect(parseDateRange("", "")).toBeUndefined();
    expect(parseDateRange("besok", "lusa")).toBeUndefined();
    expect(parseDateRange("2026-13-45", undefined)).toBeUndefined();
  });

  it("ignores one unusable side instead of dropping the whole filter", () => {
    expect(parseDateRange("2026-10-02", "bukan tanggal")?.gte?.toISOString()).toBe(
      "2026-10-01T17:00:00.000Z"
    );
  });
});

describe("groupByDay", () => {
  const at = (x: { created_at: Date }) => x.created_at;

  it("keeps the order it was given and opens a group per day", () => {
    const rows = [
      { id: "a", created_at: utc("2026-10-02T11:24:19Z") },
      { id: "b", created_at: utc("2026-10-02T11:23:54Z") },
      { id: "c", created_at: utc("2026-09-29T09:38:43Z") },
    ];
    const groups = groupByDay(rows, at);

    expect(groups.map((g) => g.key)).toEqual(["2026-10-02", "2026-09-29"]);
    expect(groups[0].items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((r) => r.id)).toEqual(["c"]);
  });

  it("does not merge two runs of the same day that are not adjacent", () => {
    // The caller sorts; this function only breaks the list where the day
    // changes, so an unsorted list produces one group per run — visible,
    // rather than silently reordered.
    const rows = [
      { id: "a", created_at: utc("2026-10-02T11:00:00Z") },
      { id: "b", created_at: utc("2026-09-29T09:00:00Z") },
      { id: "c", created_at: utc("2026-10-02T10:00:00Z") },
    ];
    expect(groupByDay(rows, at).map((g) => g.items.length)).toEqual([1, 1, 1]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], at)).toEqual([]);
  });
});
