import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(dateInput: Date | string) {
  const date = new Date(dateInput);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(amount: number | string | any) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

export function calculateWorkingTimeMs(timeLogs: { event: string; created_at: Date }[]): number {
  let totalMs = 0;
  let lastStart: number | null = null;

  for (const log of timeLogs) {
    if (log.event === "START" || log.event === "RESUME") {
      lastStart = log.created_at.getTime();
    } else if (log.event === "PAUSE" || log.event === "DONE") {
      if (lastStart) {
        totalMs += log.created_at.getTime() - lastStart;
        lastStart = null;
      }
    }
  }

  if (lastStart) {
    totalMs += Date.now() - lastStart;
  }

  return totalMs;
}

export function formatWorkingTime(ms: number): string {
  if (ms < 60000) return "< 1m";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
