/**
 * The kepala toko's week view of their technicians' schedule: who is in, on
 * which shift, who is on leave and who covers whom. Pure; days are WIB keys
 * ("YYYY-MM-DD"), and a stored @db.Date reads as its UTC date.
 */
import { wibDayKey } from "@/lib/store-dashboard";

export type ScheduleCell =
  | { kind: "shift"; shift: string | null }
  | { kind: "off" }
  | { kind: "leave"; reason: string | null }
  | { kind: "covered"; by: string }
  | { kind: "covering"; for: string; shift: string | null }
  | { kind: "unset" };

export type ScheduleTechnician = {
  id: string;
  name: string;
  shift: string | null;
  workDays: string[] | null;
};

export type ScheduleOverride = { originalId: string; overrideId: string; day: string; shift: string | null };
export type ScheduleLeave = { technicianId: string; day: string; reason: string | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_MS = 24 * 3600_000;

/** Monday of the week holding `day`, and the seven days from it. */
export function weekOf(day: string): { monday: string; days: string[] } {
  const t = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(t).getUTCDay() + 6) % 7;
  const monday = new Date(t - weekday * DAY_MS).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10));
  return { monday, days };
}

/** The week asked for in `?week=`, else this week (in WIB). */
export function resolveWeek(param: string | undefined, now: number) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(param ?? "") && !Number.isNaN(Date.parse(`${param}T00:00:00Z`));
  return weekOf(ok ? (param as string) : wibDayKey(now));
}

export function shiftDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function dayHeading(day: string): { name: string; date: string } {
  const d = new Date(`${day}T00:00:00Z`);
  return { name: DAY_NAMES[d.getUTCDay()], date: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` };
}

export function shiftLabel(shift: string | null): string {
  return shift === "morning" ? "Pagi" : shift === "noon" ? "Siang" : "Masuk";
}

/** One technician's day. Leave wins, then a swap, then the weekly pattern. */
export function scheduleCell(
  tech: ScheduleTechnician,
  day: string,
  leaves: readonly ScheduleLeave[],
  overrides: readonly ScheduleOverride[],
  nameOf: (id: string) => string,
): ScheduleCell {
  const leave = leaves.find((l) => l.technicianId === tech.id && l.day === day);
  if (leave) return { kind: "leave", reason: leave.reason };
  const away = overrides.find((o) => o.originalId === tech.id && o.day === day);
  if (away) return { kind: "covered", by: nameOf(away.overrideId) };
  const cover = overrides.find((o) => o.overrideId === tech.id && o.day === day);
  if (cover) return { kind: "covering", for: nameOf(cover.originalId), shift: cover.shift };
  if (!tech.workDays || tech.workDays.length === 0) return { kind: "unset" };
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return tech.workDays.includes(weekday) ? { kind: "shift", shift: tech.shift } : { kind: "off" };
}
