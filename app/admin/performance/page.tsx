import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import ExportToPDF from "./ExportToPDF";
import SharePerformance from "./SharePerformance";
import { EARNING_STATUS_LOG_FILTER } from "@/lib/kpi";

// NOTE: disagrees with the writers' table in app/actions/technician.ts.
// Pre-existing since 2026-07-27; unifying it is fix/points-table-unification.
function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export const metadata = { title: "Performance — HNS IT Center" };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


/** Converts decimal hours → human-readable "X Days Y Hours" (or just "Y Hours" / "< 1 Hour") */
function formatAvgTime(hours: number): string {
  if (hours < 1) return "< 1 Hour";
  const totalHours = Math.round(hours);
  const days = Math.floor(totalHours / 24);
  const remainHours = totalHours % 24;
  if (days === 0) return `${remainHours}h`;
  if (remainHours === 0) return `${days}d`;
  return `${days}d ${remainHours}h`;
}

type TicketDetails = { count: number; totalHours: number; timedCount: number; };

type Row = {
  id: string;
  name: string;
  shift: string | null;
  workDays: string[];
  tickets: number;
  success: number;
  failed: number;
  points: number;
  activeTickets: number;
  details?: Record<string, TicketDetails>;
};

export default async function AdminPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; store?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;

  const now = new Date();
  const filterMonth = params.month ? parseInt(params.month) : null;
  const filterYear  = params.year  ? parseInt(params.year)  : null;
  const filterStore = params.store || null;

  const stores = await db.storeLocation.findMany({
    where: { is_active: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  let allowedTechIds: Set<string> | null = null;
  if (filterStore) {
    const assignments = await db.technicianStoreAssignment.findMany({
      where: { store_id: filterStore },
      select: { technician_id: true },
    });
    allowedTechIds = new Set(assignments.map((a) => a.technician_id));
  }

  let rows: Row[] = [];

  if (filterMonth && filterYear) {
    // Period mode: join via tickets completed in the period
    const startDate = new Date(filterYear, filterMonth - 1, 1);
    const endDate   = new Date(filterYear, filterMonth, 1);

    // Fetch done + failed tickets in parallel, then batch-resolve users
    // Collect all unique technician IDs from both done and failed tickets in parallel
    const [earningLogs, failedTickets] = await Promise.all([
      // One row per earning event, not per ticket: a warranty claim earns at
      // handover to RMA, and the `done` written when its case closes earns
      // nothing. Same filter as the leaderboard -- see lib/kpi.ts.
      db.ticketStatusLog.findMany({
        where: {
          ...EARNING_STATUS_LOG_FILTER,
          created_at: { gte: startDate, lt: endDate },
          ticket: { technician_id: { not: null } },
        },
        select: {
          ticket: {
            select: {
              id: true,
              ticket_type: true,
              device_type: true,
              technician_id: true,
            },
          },
        },
      }),
      db.ticket.findMany({
        where: {
          status: { in: ["cancelled", "rejected"] },
          technician_id: { not: null },
          status_logs: {
            some: {
              new_status: { in: ["cancelled", "rejected"] },
              created_at: { gte: startDate, lt: endDate },
            },
          },
        },
        select: { technician_id: true },
      }),
    ]);

    // Batch-fetch all relevant users in ONE query (eliminates N+1)
    const allTechIds = [...new Set([
      ...earningLogs.map((l) => l.ticket.technician_id!),
      ...failedTickets.map((t) => t.technician_id!),
    ].filter(Boolean))];

    const allUsers = await db.user.findMany({
      where: { id: { in: allTechIds } },
      select: { id: true, name: true, shift: true, work_days: true },
    });
    const allUserMap = new Map(allUsers.map((u) => [u.id, u]));

    const techMap = new Map<string, Row>();

    const getOrCreate = (techId: string): Row => {
      if (!techMap.has(techId)) {
        const u = allUserMap.get(techId);
        techMap.set(techId, {
          id: techId,
          name: u?.name ?? "Unknown",
          shift: u?.shift ?? null,
          workDays: Array.isArray(u?.work_days) ? (u!.work_days as string[]) : [],
          tickets: 0, success: 0, failed: 0, points: 0,
          activeTickets: 0,
        });
      }
      return techMap.get(techId)!;
    };

    for (const { ticket: t } of earningLogs) {
      if (!t.technician_id) continue;
      const row = getOrCreate(t.technician_id);
      row.tickets++;
      row.success++;
      row.points += getTicketPoints(t.ticket_type, t.device_type);
    }
    for (const t of failedTickets) {
      if (!t.technician_id) continue;
      const row = getOrCreate(t.technician_id);
      row.tickets++;
      row.failed++;
    }

    // Fetch active tickets for display
    const activeTicketsData = await db.ticket.groupBy({
      by: ["technician_id"],
      where: { technician_id: { in: Array.from(techMap.keys()) }, status: { in: ["waiting", "on_progress"] } },
      _count: { id: true },
    });
    for (const data of activeTicketsData) {
      if (!data.technician_id) continue;
      const row = techMap.get(data.technician_id);
      if (row) { row.activeTickets = data._count.id; }
    }

    rows = Array.from(techMap.values()).sort((a, b) => b.points - a.points);

  } else {
    // All-time mode: use TechnicianPerformance + join technician and workload separately
    const performance = await db.technicianPerformance.findMany({
      orderBy: { total_points_completed: "desc" },
    });

    const techIds = performance.map((p) => p.technician_id);

    const users = await db.user.findMany({
      where: { id: { in: techIds } },
      select: { id: true, name: true, shift: true, work_days: true },
    });
    const activeTicketsData = await db.ticket.groupBy({
      by: ["technician_id"],
      where: { technician_id: { in: techIds }, status: { in: ["waiting", "on_progress"] } },
      _count: { id: true },
    });

    const userMap  = new Map(users.map((u) => [u.id, u]));
    const activeMap = new Map(activeTicketsData.map((d) => [d.technician_id, d._count.id]));

    rows = performance.map((p) => {
      const u  = userMap.get(p.technician_id);
      return {
        id: p.technician_id,
        name: u?.name ?? "Unknown",
        shift: u?.shift ?? null,
        workDays: Array.isArray(u?.work_days) ? (u!.work_days as string[]) : [],
        tickets: p.tickets_handled,
        success: p.success_count,
        failed: p.failed_count,
        points: p.total_points_completed,
        activeTickets: activeMap.get(p.technician_id) ?? 0,
      };
    });
  }

  if (allowedTechIds) {
    rows = rows.filter((r) => allowedTechIds!.has(r.id));
  }

  // Fetch detailed tickets for all displayed technicians to compute average times
  const techIds = rows.map(r => r.id);
  const startDate = filterMonth && filterYear ? new Date(filterYear, filterMonth - 1, 1) : null;
  const endDate   = filterMonth && filterYear ? new Date(filterYear, filterMonth, 1) : null;

  const completedTickets = await db.ticket.findMany({
    where: {
      technician_id: { in: techIds },
      status: { in: ["done", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered", "completed"] },
      ...(startDate && endDate ? {
        status_logs: {
          some: {
            new_status: "done",
            created_at: { gte: startDate, lt: endDate },
          }
        }
      } : {})
    },
    select: {
      technician_id: true,
      ticket_type: true,
      // Splits the two kinds of finished claim apart in the breakdown below.
      warranty_detail: { select: { claim_eligible: true } },
      time_logs: { select: { event: true, created_at: true }, orderBy: { created_at: "asc" } }
    }
  });

  const rowMap = new Map(rows.map(r => [r.id, r]));

  // We need calculateWorkingTimeMs, let's just copy the logic here or import it.
  // Actually, wait, calculateWorkingTimeMs is in @/lib/utils, let's use it.
  // Since we are doing a replace, let's make sure it's imported at the top.
  // Or better yet, just inline it for safety if we can't easily add the import.
  // We can just calculate the time logs directly here.

  for (const t of completedTickets) {
    if (!t.technician_id) continue;
    const row = rowMap.get(t.technician_id);
    if (!row) continue;

    if (!row.details) row.details = {};

    // A claim turned down after examination earns the same as one handed to the
    // RMA desk, so it belongs in the success figures — but it is a different
    // outcome, and lumping both under "Warranty Claim" would hide that. Every
    // claim report has to separate them; see FLOW.md § 5.
    const detailKey =
      t.ticket_type === "warranty_claim" && t.warranty_detail?.claim_eligible === false
        ? "warranty_claim_ineligible"
        : t.ticket_type;

    if (!row.details[detailKey]) row.details[detailKey] = { count: 0, totalHours: 0, timedCount: 0 };

    const det = row.details[detailKey];
    det.count++;

    let totalMs = 0;
    let lastStart: number | null = null;
    for (const log of t.time_logs) {
      if (log.event === "START" || log.event === "RESUME") {
        lastStart = log.created_at.getTime();
      } else if (log.event === "PAUSE" || log.event === "DONE") {
        if (lastStart) {
          totalMs += log.created_at.getTime() - lastStart;
          lastStart = null;
        }
      }
    }
    // If it never recorded a DONE for some reason, we do not add Date.now() because it's a completed ticket.
    
    if (totalMs > 0) {
      det.totalHours += totalMs / (1000 * 60 * 60);
      det.timedCount++;
    }
  }

  const monthLabel = filterMonth && filterYear ? `${MONTHS[filterMonth - 1]} ${filterYear}` : "All Time";
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  type RankedRow = (typeof ranked)[number];

  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);

  // One tag per ticket type: how many, and the average worked time when the
  // time log has any. Same figures as before, in one place for both layouts.
  const breakdown = (p: RankedRow) =>
    p.details && Object.keys(p.details).length > 0 ? (
      <ul className="flex flex-wrap gap-1.5">
        {Object.entries(p.details).map(([type, stats]) => {
          const avgFormatted = stats.timedCount > 0 ? formatAvgTime(stats.totalHours / stats.timedCount) : null;
          const typeLabel = type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          return (
            <li
              key={type}
              className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/60 px-2 py-1 text-[0.7rem] leading-tight"
            >
              <span className="font-semibold whitespace-nowrap text-foreground">
                {typeLabel} × {stats.count}
              </span>
              <span className={cn("whitespace-nowrap", avgFormatted ? "font-semibold text-primary" : "text-muted-foreground")}>
                {avgFormatted ? `⏱ avg ${avgFormatted}` : "no time tracked"}
              </span>
            </li>
          );
        })}
      </ul>
    ) : null;

  const columns: DataTableColumn<RankedRow>[] = [
    {
      key: "rank",
      header: "Rank",
      mobile: "hidden",
      className: "w-16",
      cell: (p) => (
        <span className={cn("font-extrabold", p.rank === 1 ? "text-amber-600" : "text-muted-foreground")}>
          {medal(p.rank)}
        </span>
      ),
    },
    {
      key: "name",
      header: "Technician",
      mobile: "title",
      className: "min-w-56",
      cell: (p) => (
        <div className="flex flex-col gap-2">
          <span className="font-semibold">
            <span className="mr-1.5 md:hidden">{medal(p.rank)}</span>
            {p.name}
          </span>
          <div className="hidden md:block">{breakdown(p)}</div>
        </div>
      ),
    },
    {
      key: "shift",
      header: "Shift",
      // Shift and Active give way first on a narrow desktop; the phone card keeps them.
      className: "hidden whitespace-nowrap xl:table-cell",
      cell: (p) => <span className="capitalize">{p.shift ?? "—"}</span>,
    },
    {
      key: "active",
      header: "Active",
      className: "hidden xl:table-cell",
      cell: (p) => (
        <span className="inline-flex rounded-full bg-tone-blue-bg px-2 py-0.5 text-xs font-semibold text-tone-blue-fg">
          {p.activeTickets}
        </span>
      ),
    },
    { key: "completed", header: "Completed", cell: (p) => <span className="font-semibold">{p.tickets}</span> },
    { key: "success", header: "Success", cell: (p) => <span className="font-semibold text-tone-green-fg">{p.success}</span> },
    { key: "failed", header: "Cancelled", cell: (p) => <span className="font-semibold text-destructive">{p.failed}</span> },
    {
      key: "points",
      header: "Points",
      mobile: "badge",
      className: "whitespace-nowrap text-right",
      cell: (p) => <span className="font-bold whitespace-nowrap text-primary">{p.points} pts</span>,
    },
    {
      key: "breakdown",
      header: "Breakdown",
      mobile: "footer",
      // The tags sit under the name on desktop; this column is the phone card's.
      className: "hidden",
      cell: (p) => breakdown(p),
    },
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-performance" className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="size-6" /> Performance Tracking
          </span>
        }
        description={
          filterMonth && filterYear ? `${MONTHS[filterMonth - 1]} ${filterYear} — filtered period` : "All-time technician statistics"
        }
        actions={
          <>
            {rows.length > 0 && <SharePerformance topTechnician={rows[0]} monthLabel={monthLabel} />}
            <ExportToPDF
              rows={rows}
              filterMonth={filterMonth}
              filterYear={filterYear}
              monthLabel={monthLabel}
              storeName={filterStore ? (stores.find((s) => s.id === filterStore)?.name ?? null) : null}
            />
          </>
        }
      />

      <FilterBar action="/admin/performance">
        <FilterBarField label="Store" htmlFor="perf-store">
          <NativeSelect id="perf-store" name="store" defaultValue={filterStore ?? ""}>
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </FilterBarField>
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Month" htmlFor="perf-month" className="md:w-36">
            <NativeSelect id="perf-month" name="month" defaultValue={filterMonth ?? ""}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <FilterBarField label="Year" htmlFor="perf-year" className="md:w-28">
            <NativeSelect id="perf-year" name="year" defaultValue={filterYear ?? now.getFullYear()}>
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          <Button type="submit">Apply</Button>
          {(filterMonth || filterYear || filterStore) && (
            <Link href="/admin/performance" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </FilterBar>

      <DataTable
        caption="Technician performance"
        columns={columns}
        rows={ranked}
        getRowKey={(p) => p.id}
        empty={<EmptyState icon={TrendingUp} title="No performance data for the selected period." />}
      />
    </div>
  );
}
