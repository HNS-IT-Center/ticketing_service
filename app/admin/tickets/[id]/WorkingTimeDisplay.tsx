"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calcWorkingMs,
  formatMs,
  isTimerPaused,
  isTimerRunning,
  type TimeLogEvent,
} from "@/lib/working-time";

interface Props {
  timeLogs: TimeLogEvent[];
  isDone: boolean;
  /**
   * The clock as the server read it while rendering this page.
   *
   * It used to be read here instead, in a `useState` initialiser — which runs
   * once on the server and again in the browser when it hydrates. Those two
   * readings are separated by however long the response took, so a running
   * timer rendered "6h 55m 2s" on the server and "6h 55m 36s" on the client,
   * and React discarded the tree with a hydration mismatch.
   *
   * Taking the server's reading as a prop makes the first client render
   * identical to the server's by construction. The real clock takes over a
   * second later, from the interval below, where it is safe.
   */
  serverNow: number;
}

export default function WorkingTimeDisplay({ timeLogs, isDone, serverNow }: Props) {
  const [ms, setMs] = useState(() => calcWorkingMs(timeLogs, serverNow));
  const isActive = isTimerRunning(timeLogs, isDone);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setMs(calcWorkingMs(timeLogs, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLogs, isActive]);

  if (timeLogs.length === 0) return null;

  const isPaused = isTimerPaused(timeLogs, isDone);

  // Done green, paused amber, running indigo — as before, through the tones.
  const tone = isDone
    ? "border-tone-green-border bg-tone-green-bg text-tone-green-fg"
    : isPaused
      ? "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg"
      : "border-indigo-200 bg-indigo-50 text-indigo-600";
  const label = isDone ? "Total Working Time" : isPaused ? "Paused — Time so far" : "Working Time";

  return (
    <div data-slot="working-time" className={cn("flex items-center gap-3 rounded-[0.625rem] border px-4 py-2.5", tone)}>
      <Timer aria-hidden="true" className="size-[18px] shrink-0" />
      <div>
        <div className="text-[0.7rem] font-semibold tracking-wide uppercase">{label}</div>
        <div className="text-lg font-bold tracking-tight tabular-nums">
          {formatMs(ms)}
          {isActive && <span aria-hidden="true" className="ml-1 animate-pulse text-[0.6rem] opacity-60">●</span>}
        </div>
      </div>
    </div>
  );
}
