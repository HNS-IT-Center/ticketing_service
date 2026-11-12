import { describe, it, expect } from "vitest";
import { caseDurations, formatSpan } from "./stage-durations";

const D = 86_400_000;
const at = (day: number) => new Date(Date.UTC(2026, 10, 1) + day * D);
const now = at(10).getTime();

describe("caseDurations", () => {
  it("measures each stage to the next event and the current one to now", () => {
    const r = caseDurations(
      [
        { to_status: "pending_verification", created_at: at(0) },
        { to_status: "verified", created_at: at(2) },
        { to_status: "submitted_to_vendor", created_at: at(3) },
      ],
      { now, status: "submitted_to_vendor", claimOpenedAt: at(-5) },
    );
    expect(r.spans.map((s) => s.ms / D)).toEqual([2, 1, 7]);
    expect(r.spans.map((s) => s.current)).toEqual([false, false, true]);
    expect(r.rmaMs / D).toBe(10);
    expect(r.claimMs! / D).toBe(15);
    expect(r.currentMs! / D).toBe(7);
  });

  it("measures a case without events from its handover", () => {
    const r = caseDurations([], { now, status: "in_vendor_process", handedOverAt: at(4), claimOpenedAt: at(3) });
    expect(r.currentMs! / D).toBe(6);
    expect(r.rmaMs / D).toBe(6);
    expect(r.claimMs! / D).toBe(7);
  });

  it("stops the clock when the case has ended", () => {
    const r = caseDurations(
      [
        { to_status: "pending_verification", created_at: at(0) },
        { to_status: "closed", created_at: at(4) },
      ],
      { now, status: "closed", claimOpenedAt: at(-1) },
    );
    expect(r.spans).toEqual([
      { ms: 4 * D, current: false, ended: false },
      { ms: 0, current: false, ended: true },
    ]);
    expect(r.rmaMs / D).toBe(4);
    expect(r.currentMs).toBeNull();
    expect(r.claimMs! / D).toBe(5);
  });

  it("formats days, then hours below a day", () => {
    expect(formatSpan(3 * D + 5)).toBe("3 hari");
    expect(formatSpan(5 * 3_600_000)).toBe("5 jam");
    expect(formatSpan(60_000)).toBe("< 1 jam");
  });
});
