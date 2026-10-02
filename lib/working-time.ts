/**
 * How long a ticket was actually worked on, from its time log.
 *
 * Pure, and the clock is an argument rather than something read inside. That is
 * not tidiness: `WorkingTimeDisplay` used to call `Date.now()` in a `useState`
 * initialiser, which runs once on the server when the page renders and again in
 * the browser when it hydrates. The two readings are separated by however long
 * the response took, so a running timer rendered "6h 55m 2s" on the server and
 * "6h 55m 36s" on the client, and React threw a hydration mismatch. Passing the
 * server's reading in makes both renders agree; the live clock only takes over
 * after mount.
 *
 * The same reason is already written down for "days at vendor" in
 * `components/rma/RmaStatusCard.tsx`: reading the clock during render is impure.
 */

export type TimeLogEvent = { event: string; created_at: string };

/** Events that open a working interval, and events that close one. */
const OPENS = ["START", "RESUME"];
const CLOSES = ["PAUSE", "DONE"];

/**
 * Total worked milliseconds: the sum of the closed intervals, plus the open one
 * measured against `now`.
 *
 * Pauses are excluded by construction — only the spans between an opening event
 * and its closing event are counted, so a ticket worked 10 minutes, paused 5,
 * then worked 10 more totals 20 minutes rather than 25.
 *
 * `now` may be `null` to leave out an interval that is still running, which
 * gives a value that does not depend on the clock at all.
 */
export function calcWorkingMs(timeLogs: TimeLogEvent[], now: number | null): number {
  let totalMs = 0;
  let lastStart: number | null = null;

  for (const log of timeLogs) {
    const t = new Date(log.created_at).getTime();
    if (Number.isNaN(t)) continue;

    if (OPENS.includes(log.event)) {
      // A second START without an intervening PAUSE would otherwise restart the
      // span and lose the time before it; the first one wins.
      if (lastStart === null) lastStart = t;
    } else if (CLOSES.includes(log.event)) {
      if (lastStart !== null) {
        totalMs += t - lastStart;
        lastStart = null;
      }
    }
  }

  if (lastStart !== null && now !== null) {
    // A clock that has drifted behind the last START must not subtract time.
    totalMs += Math.max(0, now - lastStart);
  }

  return totalMs;
}

/** Whether the last event left an interval open, so the display should tick. */
export function isTimerRunning(timeLogs: TimeLogEvent[], isDone: boolean): boolean {
  if (isDone || timeLogs.length === 0) return false;
  return OPENS.includes(timeLogs[timeLogs.length - 1].event);
}

/** Whether work is paused rather than running or finished. */
export function isTimerPaused(timeLogs: TimeLogEvent[], isDone: boolean): boolean {
  if (isDone || timeLogs.length === 0) return false;
  return timeLogs[timeLogs.length - 1].event === "PAUSE";
}

export function formatMs(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
