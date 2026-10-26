import "server-only";
import { db } from "@/lib/db";
import type { TargetRow } from "./targets";

/** Every target row in force by `month` — the table is small: a few rows a year. */
export function loadTargetRows(month: string): Promise<TargetRow[]> {
  return db.technicianTarget.findMany({
    where: { effective_month: { lte: month } },
    select: { scope: true, effective_month: true, jobs: true, revenue: true, points: true, use_default: true },
  });
}
