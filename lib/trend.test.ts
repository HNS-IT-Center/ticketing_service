import { describe, expect, it } from "vitest";
import { GRAIN_SPAN, headlines, parsePeriode, periodRange, periodText, trendBuckets, trendRows, trendWindowStart } from "./trend";

// 13 Nov 2026, 14:00 in Batam (07:00 UTC). A Friday.
const NOW = Date.parse("2026-11-13T07:00:00Z");
const wib = (iso: string) => Date.parse(`${iso}+07:00`);

describe("trendBuckets", () => {
  it("ends with the period holding now, oldest first, at WIB midnight", () => {
    const days = trendBuckets("day", NOW);
    expect(days).toHaveLength(GRAIN_SPAN.day);
    expect(days.at(-1)!.key).toBe("2026-11-13");
    expect(days.at(-1)!.start).toBe(wib("2026-11-13T00:00:00"));
    expect(days[0].key).toBe("2026-10-15");
  });
  it("starts weeks on Monday, quarters on Jan/Apr/Jul/Oct, years on 1 Jan", () => {
    expect(trendBuckets("week", NOW).at(-1)!.key).toBe("2026-11-09");
    expect(trendBuckets("week", NOW).at(-1)!.longLabel).toBe("9 Nov – 15 Nov 2026");
    expect(trendBuckets("month", NOW).map((b) => b.key).slice(-2)).toEqual(["2026-10-01", "2026-11-01"]);
    expect(trendBuckets("month", NOW)[0].key).toBe("2025-12-01");
    expect(trendBuckets("quarter", NOW).at(-1)!.label).toBe("Q4 26");
    expect(trendBuckets("quarter", NOW)[0].key).toBe("2025-01-01");
    expect(trendBuckets("year", NOW).map((b) => b.label)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });
  it("uses the Batam date, not the server's: 23:30 WIB is still that day", () => {
    const late = wib("2026-11-13T23:30:00");
    expect(trendBuckets("day", late).at(-1)!.key).toBe("2026-11-13");
    expect(trendBuckets("day", wib("2026-11-14T00:10:00")).at(-1)!.key).toBe("2026-11-14");
  });
});

describe("trendRows", () => {
  it("puts each event in its period and leaves out what falls outside", () => {
    const buckets = trendBuckets("month", NOW);
    const rows = trendRows(buckets, {
      created: [
        { at: wib("2026-11-02T10:00:00"), type: "service" },
        { at: wib("2026-11-03T10:00:00"), type: "warranty_claim" },
        { at: wib("2026-10-31T23:59:00"), type: "service" },
        { at: wib("2020-01-01T00:00:00"), type: "service" },
      ],
      finished: [{ at: wib("2026-11-05T09:00:00"), points: 5, takings: 150_000, unpriced: 2 }],
      cancelled: [{ at: wib("2026-10-10T09:00:00") }],
    });
    const nov = rows.at(-1)!;
    const oct = rows.at(-2)!;
    expect(nov.created).toBe(2);
    expect(nov.createdByType.warranty_claim).toBe(1);
    expect(nov.finished).toBe(1);
    expect(nov.takings).toBe(150_000);
    expect(nov.points).toBe(5);
    expect(nov.unpriced).toBe(2);
    expect(oct.created).toBe(1);
    expect(oct.cancelled).toBe(1);
    expect(rows.reduce((s, r) => s + r.created, 0)).toBe(3);
  });
});

describe("headlines", () => {
  it("compares this period so far with the previous one up to the same point", () => {
    const input = {
      created: [
        { at: wib("2026-11-13T09:00:00"), type: "service" as const }, // today
        { at: wib("2026-11-12T09:00:00"), type: "service" as const }, // yesterday, before 14:00
        { at: wib("2026-11-12T09:30:00"), type: "service" as const }, // yesterday, before 14:00
        { at: wib("2026-11-12T16:00:00"), type: "service" as const }, // yesterday, after 14:00: not compared
      ],
      finished: [],
      cancelled: [],
    };
    const created = headlines("day", NOW, input).find((h) => h.metric === "created")!;
    expect(created).toMatchObject({ current: 1, previous: 2, changePct: -50 });
  });
  it("has no percentage when the previous period had nothing", () => {
    const h = headlines("month", NOW, { created: [{ at: NOW - 1000, type: "service" }], finished: [], cancelled: [] });
    expect(h.find((x) => x.metric === "created")!.changePct).toBeNull();
  });
  it("stops the previous month at its own end (31st against a 30-day month)", () => {
    const endOfDec = wib("2026-12-31T12:00:00");
    const input = { created: [{ at: wib("2026-11-30T20:00:00"), type: "service" as const }], finished: [], cancelled: [] };
    expect(headlines("month", endOfDec, input).find((x) => x.metric === "created")!.previous).toBe(1);
  });
});

describe("parsePeriode / trendWindowStart", () => {
  it("reads the Indonesian URL word, falls back to monthly, and the window reaches the comparison period", () => {
    expect(parsePeriode("bogus")).toBe("month");
    expect(parsePeriode(undefined)).toBe("month");
    expect(parsePeriode("kuartal")).toBe("quarter");
    expect(parsePeriode("harian")).toBe("day");
    expect(trendWindowStart("day", NOW)).toBe(trendBuckets("day", NOW)[0].start);
  });
});

describe("periodRange / periodText", () => {
  it("compares 1–13 November with 1–13 October, not the whole of October", () => {
    const r = periodRange("month", NOW);
    expect(r.start).toBe(wib("2026-11-01T00:00:00"));
    expect(r.end).toBe(NOW);
    expect(r.prevStart).toBe(wib("2026-10-01T00:00:00"));
    expect(r.prevEnd).toBe(wib("2026-10-13T14:00:00"));
    expect(periodText("month", NOW)).toEqual({ current: "1–13 November 2026", previous: "1–13 Oktober" });
  });
  it("sets every boundary at midnight in Batam, whatever the server's zone", () => {
    // 00:10 WIB on 1 December is still 30 November in UTC.
    const early = wib("2026-12-01T00:10:00");
    expect(periodRange("month", early).start).toBe(wib("2026-12-01T00:00:00"));
    expect(periodText("month", early).current).toBe("1 Desember 2026");
    expect(periodRange("day", wib("2026-11-13T23:59:00")).start).toBe(wib("2026-11-13T00:00:00"));
  });
  it("names weeks, quarters and years across month and year ends", () => {
    expect(periodText("week", NOW)).toEqual({ current: "9–13 November 2026", previous: "2–6 November" });
    expect(periodText("quarter", NOW)).toEqual({ current: "1 Okt – 13 Nov 2026", previous: "1 Jul – 13 Agu" });
    expect(periodText("year", NOW)).toEqual({ current: "1 Jan – 13 Nov 2026", previous: "1 Jan – 13 Nov 2025" });
    expect(periodText("day", NOW)).toEqual({ current: "13 November 2026", previous: "12 November" });
  });
  it("stops the previous period at its own end", () => {
    const r = periodRange("month", wib("2026-03-31T12:00:00"));
    expect(r.prevEnd).toBe(wib("2026-03-01T00:00:00"));
    expect(periodText("month", wib("2026-03-31T12:00:00")).previous).toBe("1–28 Februari");
  });
});
