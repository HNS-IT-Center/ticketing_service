"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

interface TimeLog {
  event: string;
  created_at: string; // ISO string - we'll serialize from server
}

interface Props {
  timeLogs: TimeLog[];
  isDone: boolean;
}

function calcWorkingMs(timeLogs: TimeLog[], now: number): number {
  let totalMs = 0;
  let lastStart: number | null = null;

  for (const log of timeLogs) {
    const t = new Date(log.created_at).getTime();
    if (log.event === "START" || log.event === "RESUME") {
      lastStart = t;
    } else if (log.event === "PAUSE" || log.event === "DONE") {
      if (lastStart) {
        totalMs += t - lastStart;
        lastStart = null;
      }
    }
  }

  // Still running (no DONE/PAUSE at the end) — add elapsed since last start
  if (lastStart) {
    totalMs += now - lastStart;
  }

  return totalMs;
}

function formatMs(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function WorkingTimeDisplay({ timeLogs, isDone }: Props) {
  const [ms, setMs] = useState(() => calcWorkingMs(timeLogs, Date.now()));

  const isActive = !isDone && timeLogs.length > 0 &&
    (timeLogs[timeLogs.length - 1].event === "START" ||
     timeLogs[timeLogs.length - 1].event === "RESUME");

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setMs(calcWorkingMs(timeLogs, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLogs, isActive]);

  if (timeLogs.length === 0) return null;

  const isPaused = !isDone && timeLogs.length > 0 &&
    timeLogs[timeLogs.length - 1].event === "PAUSE";

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
