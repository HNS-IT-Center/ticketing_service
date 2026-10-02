import { describe, expect, it } from "vitest";
import {
  calcWorkingMs,
  formatMs,
  isTimerPaused,
  isTimerRunning,
  type TimeLogEvent,
} from "./working-time";

const MIN = 60_000;
const at = (event: string, minutesFromBase: number): TimeLogEvent => ({
  event,
  created_at: new Date(Date.UTC(2026, 9, 2, 8, 0, 0) + minutesFromBase * MIN).toISOString(),
});
const base = Date.UTC(2026, 9, 2, 8, 0, 0);
const nowAt = (minutes: number) => base + minutes * MIN;

describe("calcWorkingMs", () => {
  it("counts a finished span", () => {
    expect(calcWorkingMs([at("START", 0), at("DONE", 20)], null)).toBe(20 * MIN);
  });

  it("leaves the pause out — QC E-05: 10 worked, 5 paused, 10 worked is 20 minutes", () => {
    const logs = [at("START", 0), at("PAUSE", 10), at("RESUME", 15), at("DONE", 25)];
    expect(calcWorkingMs(logs, null)).toBe(20 * MIN);
  });

  it("counts several pauses", () => {
    const logs = [
      at("START", 0), at("PAUSE", 5),
      at("RESUME", 10), at("PAUSE", 20),
      at("RESUME", 30), at("DONE", 35),
    ];
    expect(calcWorkingMs(logs, 0)).toBe(20 * MIN);
  });

  it("measures a running span against the clock it is given", () => {
    expect(calcWorkingMs([at("START", 0)], nowAt(7))).toBe(7 * MIN);
  });

  it("is the same value for the same clock — what the hydration fix depends on", () => {
    // The server renders with its reading and the browser hydrates with the
    // same number passed in; both must produce identical text.
    const logs = [at("START", 0)];
    const serverNow = nowAt(415);
    expect(formatMs(calcWorkingMs(logs, serverNow))).toBe(formatMs(calcWorkingMs(logs, serverNow)));
  });

  it("changes when the clock does — which is why it must not be read during render", () => {
    const logs = [at("START", 0)];
    expect(calcWorkingMs(logs, nowAt(10))).not.toBe(calcWorkingMs(logs, nowAt(11)));
  });

  it("omits the running span when given no clock", () => {
    const logs = [at("START", 0), at("PAUSE", 10), at("RESUME", 15)];
    expect(calcWorkingMs(logs, null)).toBe(10 * MIN);
  });

  it("does not count time while paused, however long the pause", () => {
    const logs = [at("START", 0), at("PAUSE", 10)];
    expect(calcWorkingMs(logs, nowAt(600))).toBe(10 * MIN);
  });

  it("never returns a negative total when the clock lags behind the last START", () => {
    expect(calcWorkingMs([at("START", 10)], nowAt(5))).toBe(0);
  });

  it("keeps the first START when a second arrives without a PAUSE", () => {
    // Losing the earlier one would quietly discard real worked time.
    expect(calcWorkingMs([at("START", 0), at("START", 5), at("DONE", 20)], null)).toBe(20 * MIN);
  });

  it("ignores a close with nothing open", () => {
    expect(calcWorkingMs([at("PAUSE", 5), at("START", 10), at("DONE", 20)], null)).toBe(10 * MIN);
  });

  it("ignores an unparseable timestamp rather than producing NaN", () => {
    const logs = [{ event: "START", created_at: "bukan tanggal" }, at("DONE", 20)];
    expect(Number.isNaN(calcWorkingMs(logs, null))).toBe(false);
  });

  it("is zero for an empty log", () => {
    expect(calcWorkingMs([], nowAt(99))).toBe(0);
  });
});

describe("isTimerRunning / isTimerPaused", () => {
  it("runs after START or RESUME", () => {
    expect(isTimerRunning([at("START", 0)], false)).toBe(true);
    expect(isTimerRunning([at("START", 0), at("PAUSE", 5), at("RESUME", 6)], false)).toBe(true);
  });

  it("does not run once paused or done", () => {
    expect(isTimerRunning([at("START", 0), at("PAUSE", 5)], false)).toBe(false);
    expect(isTimerRunning([at("START", 0), at("DONE", 5)], false)).toBe(false);
    expect(isTimerRunning([at("START", 0)], true)).toBe(false);
  });

  it("never runs on an empty log", () => {
    expect(isTimerRunning([], false)).toBe(false);
  });

  it("is paused only between a PAUSE and whatever follows it", () => {
    expect(isTimerPaused([at("START", 0), at("PAUSE", 5)], false)).toBe(true);
    expect(isTimerPaused([at("START", 0)], false)).toBe(false);
    expect(isTimerPaused([at("START", 0), at("PAUSE", 5)], true)).toBe(false);
  });

  it("is never both running and paused", () => {
    const cases: TimeLogEvent[][] = [
      [], [at("START", 0)], [at("START", 0), at("PAUSE", 5)],
      [at("START", 0), at("PAUSE", 5), at("RESUME", 6)],
      [at("START", 0), at("DONE", 9)],
    ];
    for (const logs of cases) {
      for (const done of [true, false]) {
        expect(isTimerRunning(logs, done) && isTimerPaused(logs, done)).toBe(false);
      }
    }
  });
});

describe("formatMs", () => {
  it("formats by the largest unit present", () => {
    expect(formatMs(0)).toBe("0s");
    expect(formatMs(999)).toBe("0s");
    expect(formatMs(45_000)).toBe("45s");
    expect(formatMs(3 * MIN + 7_000)).toBe("3m 7s");
    expect(formatMs(2 * 3_600_000 + 5 * MIN + 9_000)).toBe("2h 5m 9s");
  });

  it("keeps a zero middle unit so the shape does not change", () => {
    expect(formatMs(3_600_000)).toBe("1h 0m 0s");
  });
});
