"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { dayOffProblem, daysOffOf, isWeekday, listDays, readWorkDays, workDaysFrom, type Weekday } from "@/lib/day-off";
import { scheduleScopeFor, technicianInScope } from "@/lib/day-off-server";

type Result = { success: true } | { error: string };

/**
 * Libur tetap (owner, 2026-11-19): a technician's weekly days off, and the
 * colleague who covers them. The days off are written as the technician's
 * `work_days` — the one weekly pattern every schedule figure reads — so the
 * admin's user form and this page edit the same thing.
 *
 * Covering is a marker plus a notification; no ticket moves (owner's choice).
 */
export async function saveDayOffRuleAction(input: { technicianId: string; daysOff: string[]; replacementId: string | null; note: string }): Promise<Result> {
  const session = await requireSession();
  const scope = await scheduleScopeFor(session);
  if (!scope) return { error: "Kamu tidak punya akses mengatur jadwal teknisi." };

  const technicianId = String(input.technicianId ?? "");
  const daysOff = Array.isArray(input.daysOff) ? input.daysOff.map(String) : [];
  const replacementId = input.replacementId ? String(input.replacementId) : null;
  const note = String(input.note ?? "").trim();

  const problem = dayOffProblem(technicianId, { daysOff, replacementId, note });
  if (problem) return { error: problem };
  if (!(await technicianInScope(scope, technicianId))) return { error: "Teknisi ini tidak ada di toko yang kamu pegang." };

  const tech = await db.user.findUnique({
    where: { id: technicianId },
    select: {
      name: true,
      work_days: true,
      store_assignments: { select: { store_id: true } },
      day_off_rule: { select: { replacement_id: true, replacement: { select: { name: true } } } },
    },
  });
  if (!tech) return { error: "Teknisi tidak ditemukan." };

  let replacement: { id: string; name: string } | null = null;
  if (replacementId) {
    // A colleague who can stand in: an active technician of one of the same stores.
    const storeIds = tech.store_assignments.map((s) => s.store_id);
    replacement = await db.user.findFirst({
      where: { id: replacementId, role: "Technician", is_active: true, store_assignments: { some: { store_id: { in: storeIds } } } },
      select: { id: true, name: true },
    });
    if (!replacement) return { error: "Pengganti harus teknisi aktif di toko yang sama." };
  }

  const wanted = [...new Set(daysOff)].filter(isWeekday) as Weekday[];
  const workDays = workDaysFrom(wanted);
  const offNow = daysOffOf(workDays) as Weekday[];
  const offBefore = daysOffOf(readWorkDays(tech.work_days));
  const daysChanged = offBefore === null || offBefore.join() !== offNow.join();
  const oldReplacement = tech.day_off_rule?.replacement_id ?? null;
  const replacementChanged = oldReplacement !== (replacement?.id ?? null);

  await db.$transaction([
    db.user.update({ where: { id: technicianId }, data: { work_days: workDays } }),
    db.technicianDayOffRule.upsert({
      where: { technician_id: technicianId },
      create: { technician_id: technicianId, replacement_id: replacement?.id ?? null, note: note || null, updated_by_name: session.name },
      update: { replacement_id: replacement?.id ?? null, note: note || null, updated_by_name: session.name },
    }),
  ]);

  const days = listDays(offNow);
  // Notices carry no ticket. Best effort: the schedule is already saved.
  const notices: { user_id: string; message: string }[] = [];
  if (daysChanged || replacementChanged) {
    notices.push({
      user_id: technicianId,
      message: `Libur tetap Anda: setiap ${days}. ${replacement ? `Digantikan ${replacement.name}.` : "Tanpa pengganti tetap."}`,
    });
  }
  if (replacement && (daysChanged || replacementChanged)) {
    notices.push({ user_id: replacement.id, message: `Setiap ${days} Anda menggantikan ${tech.name}.` });
  }
  if (oldReplacement && replacementChanged) {
    notices.push({ user_id: oldReplacement, message: `Anda tidak lagi menggantikan ${tech.name} saat libur.` });
  }
  if (notices.length) {
    try {
      await db.notification.createMany({ data: notices.map((n) => ({ ...n, type: "schedule" as const, ticket_id: null })) });
    } catch (err) {
      console.error("[day-off] notification failed:", err);
    }
  }

  await logActivity(
    session,
    "schedule.dayoff",
    `Mengatur libur tetap ${tech.name}: setiap ${days}, ${replacement ? `digantikan ${replacement.name}` : "tanpa pengganti"}.`,
    { type: "user", id: technicianId, label: tech.name },
  );

  revalidatePath("/toko/jadwal");
  revalidatePath("/technician/schedule");
  revalidatePath("/technician/dashboard");
  return { success: true };
}
