import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import { isAdminRole } from "@/lib/admin-roles";
import { daysOffOf, leaveFactor, readWorkDays, type CoverRule, type Weekday } from "@/lib/day-off";

/**
 * Who may set technicians' schedules, and whose (owner, 2026-11-19: the
 * "Kelola jadwal teknisi" setting in Role & Izin). An administrator holds every
 * store; a coordinator the stores they work in; a kepala toko the stores they
 * hold. Null = may not set schedules at all.
 */
export type ScheduleScope = { storeIds: string[] | null };

export async function scheduleScopeFor(session: { userId: string; role: string }): Promise<ScheduleScope | null> {
  const access = await accessFor(session.userId);
  if (!access.can("manage_schedule")) return null;
  if (isAdminRole(session.role)) return { storeIds: null };
  if (session.role === "StoreSupervisor") {
    const rows = await db.storeSupervisorAssignment.findMany({ where: { user_id: session.userId }, select: { store_id: true } });
    return { storeIds: rows.map((r) => r.store_id) };
  }
  if (session.role === "Technician") {
    const rows = await db.technicianStoreAssignment.findMany({ where: { technician_id: session.userId }, select: { store_id: true } });
    return { storeIds: rows.map((r) => r.store_id) };
  }
  return null;
}

/** Active technicians of these stores; null = every store. */
export function technicianWhere(storeIds: string[] | null): Prisma.UserWhereInput {
  return {
    role: "Technician",
    is_active: true,
    ...(storeIds ? { store_assignments: { some: { store_id: { in: storeIds } } } } : {}),
  };
}

/** Whether a technician is within the scope. */
export async function technicianInScope(scope: ScheduleScope, technicianId: string): Promise<boolean> {
  const hit = await db.user.findFirst({ where: { id: technicianId, ...technicianWhere(scope.storeIds) }, select: { id: true } });
  return Boolean(hit);
}

export type DayOffMember = {
  id: string;
  name: string;
  isLead: boolean;
  workDays: Weekday[] | null;
  daysOff: Weekday[] | null;
  storeIds: string[];
  replacement: { id: string; name: string } | null;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

/** The technicians of these stores with their days off and fixed replacement. */
export async function loadDayOffMembers(storeIds: string[] | null): Promise<DayOffMember[]> {
  const users = await db.user.findMany({
    where: technicianWhere(storeIds),
    select: {
      id: true,
      name: true,
      is_team_leader: true,
      work_days: true,
      store_assignments: { select: { store_id: true } },
      day_off_rule: {
        select: { note: true, updated_by_name: true, updated_at: true, replacement: { select: { id: true, name: true, is_active: true } } },
      },
    },
  });
  return users
    .map((u) => {
      const workDays = readWorkDays(u.work_days);
      const rep = u.day_off_rule?.replacement;
      return {
        id: u.id,
        name: u.name,
        isLead: u.is_team_leader,
        workDays,
        daysOff: daysOffOf(workDays),
        storeIds: u.store_assignments.map((s) => s.store_id),
        replacement: rep && rep.is_active ? { id: rep.id, name: rep.name } : null,
        note: u.day_off_rule?.note ?? null,
        updatedByName: u.day_off_rule?.updated_by_name ?? null,
        updatedAt: u.day_off_rule?.updated_at.toISOString() ?? null,
      };
    })
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, "id"));
}

/** Every fixed replacement among these technicians, for "who covers whom on a day". */
export async function loadCoverRules(technicianIds?: string[]): Promise<CoverRule[]> {
  const rules = await db.technicianDayOffRule.findMany({
    where: {
      replacement_id: { not: null },
      technician: { is_active: true },
      replacement: { is_active: true },
      ...(technicianIds ? { OR: [{ technician_id: { in: technicianIds } }, { replacement_id: { in: technicianIds } }] } : {}),
    },
    select: { technician_id: true, replacement_id: true, technician: { select: { name: true, work_days: true } } },
  });
  return rules.map((r) => ({
    technicianId: r.technician_id,
    technicianName: r.technician.name,
    replacementId: r.replacement_id as string,
    workDays: readWorkDays(r.technician.work_days),
  }));
}

/**
 * How much of a month's target still applies to each technician after leave
 * (lib/day-off.ts `leaveFactor`). A technician missing from the map keeps the
 * whole target.
 */
export async function loadLeaveFactors(technicianIds: string[], month: string) {
  const out = new Map<string, ReturnType<typeof leaveFactor>>();
  if (technicianIds.length === 0) return out;
  const [y, m] = month.split("-").map(Number);
  const [users, leaves] = await Promise.all([
    db.user.findMany({ where: { id: { in: technicianIds } }, select: { id: true, work_days: true } }),
    db.technicianLeave.findMany({
      where: { technician_id: { in: technicianIds }, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
      select: { technician_id: true, date: true },
    }),
  ]);
  const byTech = new Map<string, string[]>();
  for (const l of leaves) byTech.set(l.technician_id, [...(byTech.get(l.technician_id) ?? []), l.date.toISOString().slice(0, 10)]);
  for (const u of users) out.set(u.id, leaveFactor(readWorkDays(u.work_days), byTech.get(u.id) ?? [], month));
  return out;
}
