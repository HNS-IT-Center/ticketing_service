"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
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

  const color = isDone ? "#16a34a" : isPaused ? "#d97706" : "#4f46e5";
  const bg = isDone ? "#f0fdf4" : isPaused ? "#fffbeb" : "#eef2ff";
  const border = isDone ? "#bbf7d0" : isPaused ? "#fde68a" : "#c7d2fe";
  const label = isDone ? "Total Working Time" : isPaused ? "Paused — Time so far" : "Working Time";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: "0.625rem",
      padding: "0.625rem 1rem",
    }}>
      <Timer size={18} style={{ color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </div>
        <div style={{ fontSize: "1.125rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {formatMs(ms)}
          {isActive && <span style={{ fontSize: "0.6rem", marginLeft: "0.25rem", opacity: 0.6, animation: "pulse 1.5s infinite" }}>●</span>}
        </div>
      </div>
    </div>
  );
}
