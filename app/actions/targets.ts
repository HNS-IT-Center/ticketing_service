"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { monthRange } from "@/lib/reports/parts";
import { DEFAULT_SCOPE, readTargetForm } from "@/lib/reports/targets";

/**
 * Set a monthly target, from the month on screen onward.
 *
 * `scope` is "default" for every technician, or one technician's id. Saving
 * writes a row for (scope, month) — replacing one already set for that same
 * month — and leaves earlier months on the targets they had. A technician's
 * row may instead say "back to the default" (`use_default=1`).
 *
 * Administrator only: the target is the owner's call, like the report it sits on.
 */
export async function saveTargetAction(formData: FormData) {
  const session = await requireRole("Administrator");

  const month = String(formData.get("month") ?? "");
  if (!monthRange(month)) return { error: "Bulan tidak valid." };

  const scope = String(formData.get("scope") ?? "");
  if (scope !== DEFAULT_SCOPE) {
    const tech = await db.user.findUnique({ where: { id: scope }, select: { role: true } });
    if (!tech || tech.role !== "Technician") return { error: "Teknisi tidak ditemukan." };
  }
  const useDefault = scope !== DEFAULT_SCOPE && formData.get("use_default") === "1";

  let values = { jobs: null as number | null, revenue: null as number | null, points: null as number | null };
  if (!useDefault) {
    const read = readTargetForm(formData);
    if (!read.ok) return { error: read.error };
    values = read.value;
  }

  await db.technicianTarget.upsert({
    where: { scope_effective_month: { scope, effective_month: month } },
    create: { scope, effective_month: month, ...values, use_default: useDefault, updated_by_id: session.userId },
    update: { ...values, use_default: useDefault, updated_by_id: session.userId },
  });

  revalidatePath("/admin/reports/technicians");
  revalidatePath("/technician/dashboard");
  return { success: true };
}
