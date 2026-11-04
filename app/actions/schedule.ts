"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";

export async function assignLeaveAction(formData: FormData) {
  const session = await requireRole("Technician");
  
  // Coordinator check
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true }
  });
  if (!me?.is_team_leader) return { error: "Access Denied" };

  const technician_id = formData.get("technician_id") as string;
  const dateStr = formData.get("date") as string;
  const reason = formData.get("reason") as string | null;

  if (!technician_id || !dateStr) return { error: "Missing required fields" };

  await db.technicianLeave.upsert({
    where: {
      technician_id_date: {
        technician_id,
        date: new Date(dateStr)
      }
    },
    create: {
      technician_id,
      date: new Date(dateStr),
      reason,
      is_off_day: true
    },
    update: {
      reason,
      is_off_day: true
    }
  });
  const onLeave = await db.user.findUnique({ where: { id: technician_id }, select: { name: true } });
  await logActivity(
    session,
    "schedule.leave",
    `Mencatat cuti ${onLeave?.name ?? "teknisi"} pada ${dateStr}${reason ? ` (${reason})` : ""}.`,
    { type: "user", id: technician_id, label: onLeave?.name ?? null },
  );

  revalidatePath("/technician/schedule");
  return { success: true };
}

export async function overrideShiftAction(formData: FormData) {
  const session = await requireRole("Technician");
  
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true }
  });
  if (!me?.is_team_leader) return { error: "Access Denied" };

  const original_tech_id = formData.get("original_tech_id") as string;
  const override_tech_id = formData.get("override_tech_id") as string;
  const dateStr = formData.get("date") as string;
  const shift = formData.get("shift") as "morning" | "noon";

  if (!original_tech_id || !override_tech_id || !dateStr || !shift) {
    return { error: "Missing required fields" };
  }

  await db.shiftOverride.upsert({
    where: {
      original_tech_id_date: {
        original_tech_id,
        date: new Date(dateStr)
      }
    },
    create: {
      original_tech_id,
      override_tech_id,
      date: new Date(dateStr),
      shift
    },
    update: {
      override_tech_id,
      shift
    }
  });
  const [from, to] = await Promise.all([
    db.user.findUnique({ where: { id: original_tech_id }, select: { name: true } }),
    db.user.findUnique({ where: { id: override_tech_id }, select: { name: true } }),
  ]);
  await logActivity(
    session,
    "schedule.override",
    `Menukar shift ${shift === "morning" ? "pagi" : "siang"} ${dateStr}: ${from?.name ?? "teknisi"} digantikan ${to?.name ?? "teknisi"}.`,
    { type: "user", id: original_tech_id, label: from?.name ?? null },
  );

  revalidatePath("/technician/schedule");
  return { success: true };
}
