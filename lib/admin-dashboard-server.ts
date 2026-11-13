import "server-only";
import { db } from "@/lib/db";
import { EARNING_TRANSITION_FILTER } from "@/lib/kpi";
import { currentMonth } from "@/lib/reports/parts";
import { targetFor } from "@/lib/reports/targets";
import { loadTargetRows } from "@/lib/reports/targets-data";
import { summarizeTargets } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { loadFollowups } from "@/lib/store-followups-server";
import { headlines, periodRange, trendBuckets, trendRows, trendWindowStart, type Grain } from "@/lib/trend";
import { loadStoreClaims, withUnitCosts } from "@/lib/finance-claims-server";
import { heldMoney, type HeldMoney } from "@/lib/finance-claims";
import type { CostAccess } from "@/lib/catalog/hns-data";
import {
  attention,
  finishFacts,
  firstPaidFinishes,
  periodTotals,
  storeSummaries,
  targetProgress,
  technicianSummaries,
  technicianTeams,
  type CreatedIn,
  type TargetProgress,
} from "@/lib/admin-dashboard";

const ENDED = { new_status: { in: ["cancelled", "rejected"] as ("cancelled" | "rejected")[] } };

/**
 * Everything the Ringkasan Bisnis page shows, across every store. Read only.
 * The money figures are computed for every viewer; the page decides who sees
 * them, and never hands them to a client component it does not render.
 */
export async function loadAdminDashboard(grain: Grain, now: number) {
  const since = new Date(trendWindowStart(grain, now));
  const range = periodRange(grain, now);
  const month = currentMonth(now);

  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  const [created, earning, ended, staff, followups, targetData, targetRows] = await Promise.all([
    db.ticket.findMany({ where: { created_at: { gte: since } }, select: { created_at: true, ticket_type: true, store_location_id: true } }),
    // Every paid transition in the window — taken-off points included: the
    // ticket was still finished and billed; finishFacts makes its points 0.
    db.ticketStatusLog.findMany({
      where: { AND: [EARNING_TRANSITION_FILTER, { created_at: { gte: since } }] },
      select: { ticket_id: true, new_status: true, created_at: true, ticket: { select: { ticket_type: true } } },
    }),
    db.ticketStatusLog.findMany({ where: { ...ENDED, created_at: { gte: since } }, select: { ticket_id: true, new_status: true, created_at: true } }),
    db.user.findMany({
      where: { role: "Technician", is_active: true },
      select: { id: true, name: true, store_assignments: { select: { store_id: true } } },
      orderBy: { name: "asc" },
    }),
    loadFollowups(stores.map((s) => s.id), now),
    loadTargetData(month, null),
    loadTargetRows(month),
  ]);

  // A ticket already paid (or ended) before the window is not finished again inside it.
  const earningIds = [...new Set(earning.map((l) => l.ticket_id))];
  const endedIds = [...new Set(ended.map((l) => l.ticket_id))];
  const [paidBefore, endedBefore] = await Promise.all([
    earningIds.length
      ? db.ticketStatusLog.findMany({
          where: { AND: [EARNING_TRANSITION_FILTER, { created_at: { lt: since }, ticket_id: { in: earningIds } }] },
          select: { ticket_id: true },
          distinct: ["ticket_id"],
        })
      : [],
    endedIds.length
      ? db.ticketStatusLog.findMany({ where: { ...ENDED, created_at: { lt: since }, ticket_id: { in: endedIds } }, select: { ticket_id: true }, distinct: ["ticket_id"] })
      : [],
  ]);

  const finishedAt = firstPaidFinishes(
    earning.map((l) => ({ ticketId: l.ticket_id, ticketType: l.ticket.ticket_type, newStatus: l.new_status, at: l.created_at.getTime() })),
    new Set(paidBefore.map((l) => l.ticket_id)),
  );
  const endedBeforeSet = new Set(endedBefore.map((l) => l.ticket_id));
  const endedAt = new Map<string, number>();
  for (const l of [...ended].sort((a, b) => +a.created_at - +b.created_at)) {
    if (!endedBeforeSet.has(l.ticket_id) && !endedAt.has(l.ticket_id)) endedAt.set(l.ticket_id, l.created_at.getTime());
  }

  const finishedTickets = finishedAt.size
    ? await db.ticket.findMany({
        where: { id: { in: [...finishedAt.keys()] } },
        select: {
          id: true,
          ticket_type: true,
          device_type: true,
          store_location_id: true,
          technician_id: true,
          points_excluded_at: true,
          cleaning_detail: { select: { service_package: true } },
          // Selling price only: unit_cost is never read for this page.
          charges: { select: { kind: true, quantity: true, unit_price: true, job_points: true } },
          time_logs: { select: { event: true, created_at: true }, orderBy: { created_at: "asc" } },
        },
      })
    : [];

  const finishes = finishedTickets.map((t) =>
    finishFacts(
      {
        id: t.id,
        ticketType: t.ticket_type,
        deviceType: t.device_type,
        cleaningPackage: t.cleaning_detail?.service_package ?? null,
        pointsExcluded: t.points_excluded_at !== null,
        storeId: t.store_location_id,
        technicianId: t.technician_id,
        charges: t.charges,
        timeLogs: t.time_logs.map((l) => ({ event: l.event, created_at: l.created_at.toISOString() })),
      },
      finishedAt.get(t.id) as number,
    ),
  );
  const createdIn: CreatedIn[] = created.map((t) => ({ at: t.created_at.getTime(), type: t.ticket_type, storeId: t.store_location_id }));

  const input = { created: createdIn, finished: finishes, cancelled: [...endedAt.values()].map((at) => ({ at })) };
  const buckets = trendBuckets(grain, now);

  // Technicians: every active one, plus anyone who finished a ticket in the period since deactivated.
  const techs = new Map<string, { id: string; name: string }>(staff.map((s) => [s.id, { id: s.id, name: s.name }]));
  const storesOf = new Map<string, string[]>(staff.map((s) => [s.id, s.store_assignments.map((a) => a.store_id)]));
  const missing = [...new Set(finishes.filter((f) => f.at >= range.start && f.technicianId && !techs.has(f.technicianId)).map((f) => f.technicianId as string))];
  if (missing.length) {
    const gone = await db.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, store_assignments: { select: { store_id: true } } },
    });
    for (const u of gone) {
      techs.set(u.id, { id: u.id, name: u.name });
      storesOf.set(u.id, u.store_assignments.map((a) => a.store_id));
    }
  }

  // This month's target, exactly as the Target Teknisi report computes it.
  const summary = summarizeTargets(targetData?.technicians ?? [], targetData?.doneTickets ?? [], targetData?.lines ?? []);
  const rowsById = new Map(summary.rows.map((r) => [r.technician.id, r]));
  const targets = new Map<string, TargetProgress>();
  for (const id of techs.keys()) targets.set(id, targetProgress(rowsById.get(id), targetFor(targetRows, id, month)));

  const att = attention(followups);
  const technicians = technicianSummaries([...techs.values()], finishes, range, targets);

  return {
    rows: trendRows(buckets, input),
    headlines: headlines(grain, now, input),
    totals: periodTotals(createdIn, finishes, range),
    stores: storeSummaries(stores, createdIn, finishes, range, att.perStore),
    teams: technicianTeams(stores, technicians, storesOf),
    attention: att,
    month,
  };
}

export type AdminDashboardData = Awaited<ReturnType<typeof loadAdminDashboard>>;

export type HeldClaims = {
  /** Store-stock claims still at the vendor, now. */
  atVendor: number;
  /** Their value at harga modal — only when the viewer may see it and the catalogue gives costs. */
  money: HeldMoney | null;
  cost: CostAccess | "hidden";
};

/**
 * Store-stock claims still at the vendor (FN2's rule), and the stock they
 * hold valued at harga modal. The value is an aggregate only — no unit's cost
 * leaves this function — and only for a viewer allowed both the finance
 * figures and harga modal.
 */
export async function loadHeldClaims(now: number, mayValue: boolean): Promise<HeldClaims> {
  const rows = await loadStoreClaims({}, now);
  const atVendor = rows.filter((r) => r.span?.open);
  if (!mayValue) return { atVendor: atVendor.length, money: null, cost: "hidden" };
  const { rows: costed, cost } = await withUnitCosts(atVendor);
  return { atVendor: atVendor.length, money: cost === "ok" ? heldMoney(costed) : null, cost };
}
