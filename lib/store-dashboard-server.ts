import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { EARNING_STATUS_LOG_FILTER } from "@/lib/kpi";
import { isTimerPaused } from "@/lib/working-time";
import { analyzeClaims } from "@/lib/rma/claim-analysis";
import {
  byCategory,
  byTechnician,
  intakeSeries,
  oldestUnfinished,
  periodDays,
  pipeline,
  wibDayKey,
  type FinishedTicket,
  type OpenTicket,
  type Period,
} from "@/lib/store-dashboard";

export type DashboardStore = { id: string; name: string; code: string };

/**
 * The stores a viewer may look at: a kepala toko their own, an administrator
 * every active one. Anyone else none — the page is not theirs.
 */
export async function storesFor(session: { userId: string; role: string }): Promise<DashboardStore[]> {
  const role = session.role as Role;
  if (role === "Administrator") {
    return db.storeLocation.findMany({
      where: { is_active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
  }
  if (role === "StoreSupervisor") {
    const rows = await db.storeSupervisorAssignment.findMany({
      where: { user_id: session.userId },
      select: { store: { select: { id: true, name: true, code: true } } },
      orderBy: { store: { name: "asc" } },
    });
    return rows.map((r) => r.store);
  }
  return [];
}

const OPEN_STATUSES = ["waiting", "on_progress", "rma_process", "done", "ready_for_pickup", "waiting_pickup", "handed_to_courier"] as const;

const days = (list: { date: Date }[]) => new Set(list.map((l) => l.date.toISOString().slice(0, 10)));

/** Everything the dashboard shows, for the given stores and period. */
export async function loadStoreDashboard(storeIds: string[], period: Period, now: number) {
  const inStores = { store_location_id: { in: storeIds } };
  const range = { gte: period.start, lt: period.end };

  const [created, openRows, earningLogs, assigned, claims] = await Promise.all([
    db.ticket.findMany({ where: { ...inStores, created_at: range }, select: { created_at: true, ticket_type: true } }),
    db.ticket.findMany({
      where: { ...inStores, status: { in: [...OPEN_STATUSES] } },
      select: {
        id: true,
        ticket_code: true,
        status: true,
        ticket_type: true,
        technician_id: true,
        technician: { select: { name: true } },
        device_name: true,
        created_at: true,
        time_logs: { select: { event: true, created_at: true }, orderBy: { created_at: "asc" } },
      },
    }),
    // Paid finishes inside the period. A ticket counts in the period holding
    // its FIRST one, so one done twice is counted once (below).
    db.ticketStatusLog.findMany({
      where: { AND: [EARNING_STATUS_LOG_FILTER, { created_at: range, ticket: inStores }] },
      select: { ticket_id: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    db.technicianStoreAssignment.findMany({
      where: { store_id: { in: storeIds }, technician: { role: "Technician", is_active: true } },
      select: { technician: { select: { id: true, name: true, work_days: true } } },
    }),
    db.ticket.findMany({
      where: { ...inStores, ticket_type: "warranty_claim", created_at: range },
      select: {
        device_brand: true,
        device_catalog_category: true,
        device_sku: true,
        device_name: true,
        rma_case: { select: { status: true, decision: true } },
      },
    }),
  ]);

  const firstFinish = new Map<string, Date>();
  for (const l of earningLogs) if (!firstFinish.has(l.ticket_id)) firstFinish.set(l.ticket_id, l.created_at);
  const earlier = firstFinish.size
    ? await db.ticketStatusLog.findMany({
        where: { AND: [EARNING_STATUS_LOG_FILTER, { created_at: { lt: period.start }, ticket_id: { in: [...firstFinish.keys()] } }] },
        select: { ticket_id: true },
        distinct: ["ticket_id"],
      })
    : [];
  for (const e of earlier) firstFinish.delete(e.ticket_id);
  const finishedIds = [...firstFinish.keys()];

  const finishedRows = finishedIds.length
    ? await db.ticket.findMany({
        where: { id: { in: finishedIds } },
        select: {
          id: true,
          technician_id: true,
          technician: { select: { name: true } },
          ticket_type: true,
          created_at: true,
          replaced_parts: { select: { part: true } },
          time_logs: { select: { event: true, created_at: true }, orderBy: { created_at: "asc" } },
        },
      })
    : [];

  const finished: FinishedTicket[] = finishedRows.map((t) => ({
    id: t.id,
    technicianId: t.technician_id,
    ticketType: t.ticket_type,
    parts: t.replaced_parts.map((p) => p.part),
    createdAt: t.created_at,
    finishedAt: firstFinish.get(t.id) as Date,
    timeLogs: t.time_logs.map((l) => ({ event: l.event, created_at: l.created_at.toISOString() })),
  }));

  const open: OpenTicket[] = openRows.map((t) => {
    const logs = t.time_logs.map((l) => ({ event: l.event, created_at: l.created_at.toISOString() }));
    return {
      id: t.id,
      code: t.ticket_code,
      status: t.status,
      ticketType: t.ticket_type,
      technicianId: t.technician_id,
      technicianName: t.technician?.name ?? null,
      deviceName: t.device_name,
      createdAt: t.created_at,
      paused: isTimerPaused(logs, false),
    };
  });

  // The store's technicians, plus anyone else who finished one of its tickets
  // in the period (a technician lent from another store).
  const techs = new Map<string, { id: string; name: string; work_days: unknown }>();
  for (const a of assigned) techs.set(a.technician.id, a.technician);
  const outsiders = finishedRows.filter((t) => t.technician_id && !techs.has(t.technician_id));
  for (const t of outsiders) techs.set(t.technician_id as string, { id: t.technician_id as string, name: t.technician?.name ?? "—", work_days: null });
  if (outsiders.length) {
    const extra = await db.user.findMany({
      where: { id: { in: outsiders.map((t) => t.technician_id as string) } },
      select: { id: true, name: true, work_days: true },
    });
    for (const u of extra) techs.set(u.id, u);
  }

  const techIds = [...techs.keys()];
  const dayRange = { gte: new Date(`${period.fromDay}T00:00:00Z`), lte: new Date(`${period.toDay}T00:00:00Z`) };
  const [leaves, swaps] = techIds.length
    ? await Promise.all([
        db.technicianLeave.findMany({ where: { technician_id: { in: techIds }, date: dayRange }, select: { technician_id: true, date: true } }),
        db.shiftOverride.findMany({
          where: { date: dayRange, OR: [{ original_tech_id: { in: techIds } }, { override_tech_id: { in: techIds } }] },
          select: { original_tech_id: true, override_tech_id: true, date: true },
        }),
      ])
    : [[], []];

  const technicianInputs = [...techs.values()].map((t) => ({
    id: t.id,
    name: t.name,
    schedule: {
      workDays: Array.isArray(t.work_days) ? (t.work_days as unknown[]).filter((d): d is string => typeof d === "string") : null,
      leave: days(leaves.filter((l) => l.technician_id === t.id)),
      swappedAway: days(swaps.filter((s) => s.original_tech_id === t.id)),
      swappedIn: days(swaps.filter((s) => s.override_tech_id === t.id)),
    },
  }));

  const periodDayList = periodDays(period, now);
  const claimAnalysis = analyzeClaims(claims, 10);

  return {
    intake: intakeSeries(
      created.map((t) => ({ createdAt: t.created_at, ticketType: t.ticket_type })),
      periodDayList,
    ),
    intakeTotal: created.length,
    pipeline: pipeline(open),
    oldest: oldestUnfinished(open, now),
    finishedTotal: finished.length,
    technicians: byTechnician(technicianInputs, finished, open, periodDayList),
    categories: byCategory(finished),
    claims: claimAnalysis,
    today: wibDayKey(now),
  };
}

export type StoreDashboardData = Awaited<ReturnType<typeof loadStoreDashboard>>;
