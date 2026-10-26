/**
 * Monthly targets for the Target Teknisi report, as pure rules: which target
 * holds for a technician in a month, how far they are, and what a target form
 * may hold. No database — the rows are passed in.
 *
 * A target row holds from its month until a later row of the same scope, so
 * changing a target never rewrites a month already judged.
 */

import { parseRupiah } from "@/lib/charges";

export const DEFAULT_SCOPE = "default";

export type TargetMeasure = "jobs" | "revenue" | "points";
export const TARGET_MEASURES: readonly TargetMeasure[] = ["jobs", "revenue", "points"];

export type TargetRow = {
  scope: string;
  effective_month: string;
  jobs: number | null;
  revenue: number | null;
  points: number | null;
  use_default: boolean;
};

export type MonthTarget = {
  jobs: number | null;
  revenue: number | null;
  points: number | null;
  /** Whose target it is: the technician's own, the shop's default, or none at all. */
  source: "custom" | "default" | "none";
  /** The month the target in force was set from. */
  since: string | null;
};

/** The newest row of a scope that has taken effect by `month`. "YYYY-MM" sorts as text. */
function inForce(rows: readonly TargetRow[], scope: string, month: string): TargetRow | null {
  let best: TargetRow | null = null;
  for (const r of rows) {
    if (r.scope !== scope || r.effective_month > month) continue;
    if (!best || r.effective_month > best.effective_month) best = r;
  }
  return best;
}

/** The shop's default target in a month; "none" when it was never set, or was cleared. */
export function defaultTarget(rows: readonly TargetRow[], month: string): MonthTarget {
  const shop = inForce(rows, DEFAULT_SCOPE, month);
  if (shop && (shop.jobs !== null || shop.revenue !== null || shop.points !== null)) {
    return { jobs: shop.jobs, revenue: shop.revenue, points: shop.points, source: "default", since: shop.effective_month };
  }
  return { jobs: null, revenue: null, points: null, source: "none", since: null };
}

/** The target a technician is measured against in a month: their own, else the shop's. */
export function targetFor(rows: readonly TargetRow[], technicianId: string, month: string): MonthTarget {
  const own = inForce(rows, technicianId, month);
  if (own && !own.use_default) {
    return { jobs: own.jobs, revenue: own.revenue, points: own.points, source: "custom", since: own.effective_month };
  }
  return defaultTarget(rows, month);
}

export type Progress = { value: number; target: number; percent: number; met: boolean };

/** How far a value is toward its target; null when there is no target on that measure. */
export function progress(value: number, target: number | null): Progress | null {
  if (target === null || target <= 0) return null;
  const percent = Math.floor((value / target) * 100);
  return { value, target, percent, met: value >= target };
}

export const MAX_TARGET_COUNT = 10_000;

export type TargetInput = { jobs: number | null; revenue: number | null; points: number | null };

/** The three measures as the target forms post them. Empty means "no target on this one". */
export function readTargetForm(formData: FormData): { ok: true; value: TargetInput } | { ok: false; error: string } {
  const count = (field: "jobs" | "points", label: string): number | null | string => {
    const raw = String(formData.get(field) ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_TARGET_COUNT) return `Target ${label} harus angka bulat 0–${MAX_TARGET_COUNT}.`;
    return n;
  };
  const jobs = count("jobs", "jasa");
  if (typeof jobs === "string") return { ok: false, error: jobs };
  const points = count("points", "poin");
  if (typeof points === "string") return { ok: false, error: points };
  const revenue = parseRupiah(String(formData.get("revenue") ?? ""));
  if (!revenue.ok) return { ok: false, error: "Target omzet tidak valid. Tulis angka saja, mis. 5000000." };
  return { ok: true, value: { jobs, revenue: revenue.value, points } };
}
