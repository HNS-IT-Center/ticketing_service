import type { RmaStatus } from "@prisma/client";
import { isTerminalRmaStatus } from "@/lib/rma/state-machine";

/**
 * How long an RMA case spent in each stage, and in all (owner, 2026-11-12:
 * "total hari sama hari di proses itu berapa hari"). Pure: the clock is passed
 * in, so a page reads it once and the card renders the same on every pass.
 *
 * A stage runs from the event that entered it to the next event. The last one
 * runs until `now`, unless it is terminal — then the case has stopped and the
 * clock stops with it.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type StageSpan = {
  /** Milliseconds spent in the stage this event entered. */
  ms: number;
  /** The case is still in this stage. */
  current: boolean;
  /** A terminal stage: an end, not a wait. */
  ended: boolean;
};

export type CaseDurations = {
  /** One per event, same order as given (oldest first). */
  spans: StageSpan[];
  /** From the first event (the handover) to the end, or to now while open. */
  rmaMs: number;
  /** From the claim's ticket, when known — how long the customer has waited. */
  claimMs: number | null;
  /** Time in the stage the case is in now; null once it has ended. */
  currentMs: number | null;
};

export function caseDurations(
  events: readonly { to_status: RmaStatus; created_at: Date | string }[],
  opts: { now: number; status: RmaStatus; claimOpenedAt?: Date | string | null; handedOverAt?: Date | string | null },
): CaseDurations {
  const t = (d: Date | string) => new Date(d).getTime();
  const last = events[events.length - 1];
  const stopped = isTerminalRmaStatus(opts.status) && Boolean(last);
  const end = stopped ? t(last.created_at) : opts.now;

  const spans = events.map((e, i) => {
    const next = events[i + 1];
    const ended = !next && isTerminalRmaStatus(e.to_status);
    const until = next ? t(next.created_at) : ended ? t(e.created_at) : opts.now;
    return { ms: Math.max(0, until - t(e.created_at)), current: !next && !ended, ended };
  });

  const start = events[0] ? t(events[0].created_at) : opts.handedOverAt ? t(opts.handedOverAt) : end;
  // A case with no events (written before the trail existed, or by hand) is
  // measured from its handover, as the dashboard does.
  const stageStart = last ? t(last.created_at) : start;
  return {
    currentMs: isTerminalRmaStatus(opts.status) ? null : Math.max(0, opts.now - stageStart),
    spans,
    rmaMs: Math.max(0, end - start),
    claimMs: opts.claimOpenedAt ? Math.max(0, end - t(opts.claimOpenedAt)) : null,
  };
}

/** "3 hari", "5 jam", "< 1 jam" — days once a stage reaches one, hours below. */
export function formatSpan(ms: number): string {
  if (ms >= DAY) return `${Math.floor(ms / DAY)} hari`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)} jam`;
  return "< 1 jam";
}
