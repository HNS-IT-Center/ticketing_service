import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { readSort, sortValue } from "@/lib/table-sort";
import Link from "next/link";
import { History } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { parsePageSize } from "@/lib/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ACTIVITY_AREAS, activityArea, activityEntityHref, activityLabel } from "@/lib/activity-catalog";
import { activityWhere, type ActivityFilter } from "@/lib/activity-list";
import { cn, formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 50;

// One colour per area, so a page of mixed activity can be scanned.
const AREA_TONE: Record<keyof typeof ACTIVITY_AREAS, string> = {
  auth: "border-border bg-muted text-muted-foreground",
  ticket: "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg",
  charge: "border-tone-green-border bg-tone-green-bg text-tone-green-fg",
  rma: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg",
  master: "border-tone-violet-border bg-tone-violet-bg text-tone-violet-fg",
  user: "border-tone-teal-border bg-tone-teal-bg text-tone-teal-fg",
  setting: "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
  export: "border-tone-orange-border bg-tone-orange-bg text-tone-orange-fg",
};

export async function ActivityLog({
  searchParams,
}: {
  searchParams: Promise<ActivityFilter & { page?: string; per?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const { where, isFiltered } = activityWhere(params);

  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const sortState = readSort(params.sort, ["when", "who", "what", "object"], { key: "when", dir: "desc" });
  const sortParam = sortValue(sortState) === "when_desc" ? "" : sortValue(sortState);
  const orderBy: Prisma.ActivityLogOrderByWithRelationInput[] =
    sortState.key === "who"
      ? [{ actor_name: sortState.dir }, { created_at: "desc" }]
      : sortState.key === "what"
        ? [{ action: sortState.dir }, { created_at: "desc" }]
        : sortState.key === "object"
          ? [{ entity_label: sortState.dir }, { created_at: "desc" }]
          : [{ created_at: sortState.dir }];
  const total = await db.activityLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1", 10) || 1), pageCount);

  const [entries, actors] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    // Everyone who appears in the log, for the person filter — a deactivated
    // account included, since what they did is still on record.
    db.activityLog.groupBy({
      by: ["actor_id", "actor_name"],
      where: { actor_id: { not: null } },
      orderBy: { actor_name: "asc" },
    }),
  ]);

  // One option per account, under the name it last used.
  const actorOptions = [...new Map(actors.map((a) => [a.actor_id as string, a.actor_name])).entries()];

  const hrefForPage = (p: number, size: number = pageSize, sort: string = sortParam) => {
    const qs = new URLSearchParams();
    for (const key of ["q", "area", "actor", "from", "to"] as const) {
      const value = params[key];
      if (value) qs.set(key, value);
    }
    if (sort) qs.set("sort", sort);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/logs?jenis=aktivitas${str ? `&${str}` : ""}`;
  };

  type Entry = (typeof entries)[number];
  const columns: DataTableColumn<Entry>[] = [
    {
      key: "when", sortKey: "when", sortFirst: "desc",
      header: "Waktu",
      className: "whitespace-nowrap text-sm text-muted-foreground",
      mobile: "detail",
      cell: (e) => formatDateTime(e.created_at),
    },
    {
      key: "who", sortKey: "who",
      header: "Pengguna",
      mobile: "title",
      cell: (e) => (
        <span className="flex flex-col">
          <span className="font-semibold">{e.actor_name}</span>
          <span className="text-xs font-normal text-muted-foreground">{e.actor_role}</span>
        </span>
      ),
    },
    {
      key: "what", sortKey: "what",
      header: "Aktivitas",
      mobile: "badge",
      cell: (e) => {
        const area = activityArea(e.action);
        return (
          <span
            className={cn(
              "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
              area ? AREA_TONE[area] : "border-border bg-muted text-muted-foreground",
            )}
          >
            {activityLabel(e.action)}
          </span>
        );
      },
    },
    {
      key: "object", sortKey: "object",
      header: "Objek",
      mobile: "detail",
      cell: (e) => {
        if (!e.entity_label) return <span className="text-muted-foreground">—</span>;
        const href = activityEntityHref(e.entity_type, e.entity_id);
        return href ? (
          <Link href={href} className="font-mono text-sm font-semibold text-primary hover:underline">
            {e.entity_label}
          </Link>
        ) : (
          <span className="text-sm font-medium">{e.entity_label}</span>
        );
      },
    },
    {
      key: "detail",
      header: "Keterangan",
      mobileLabel: "Detail",
      mobile: "detail",
      className: "min-w-64 text-sm",
      cell: (e) => e.summary,
    },
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-activity" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <History aria-hidden="true" className="size-6" /> Log Aktivitas
          </span>
        }
        description="Siapa melakukan apa di aplikasi: masuk dan keluar, tiket, rincian biaya, RMA, Data Master, pengguna, pengaturan, dan export. Isi pesan chat dan password tidak pernah dicatat."
      />

      <FilterBar action="/logs">
          <input type="hidden" name="jenis" value="aktivitas" />
        {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
        {sortParam && <input type="hidden" name="sort" value={sortParam} />}
        <FilterBarSearch
          label="Cari aktivitas"
          placeholder="Cari kode tiket, nama, atau keterangan…"
          defaultValue={params.q ?? ""}
        />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Jenis" htmlFor="activity-area" className="md:w-40">
            <NativeSelect id="activity-area" name="area" defaultValue={params.area ?? ""}>
              <option value="">Semua jenis</option>
              {(Object.keys(ACTIVITY_AREAS) as (keyof typeof ACTIVITY_AREAS)[]).map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_AREAS[a]}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <FilterBarField label="Pengguna" htmlFor="activity-actor" className="md:w-44">
            <NativeSelect id="activity-actor" name="actor" defaultValue={params.actor ?? ""}>
              <option value="">Semua pengguna</option>
              {actorOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <FilterBarField label="Dari" htmlFor="activity-from" className="md:w-40">
            <Input id="activity-from" type="date" name="from" defaultValue={params.from ?? ""} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Sampai" htmlFor="activity-to" className="md:w-40">
            <Input id="activity-to" type="date" name="to" defaultValue={params.to ?? ""} className="bg-card" />
          </FilterBarField>
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          <Button type="submit">Filter</Button>
          {isFiltered && (
            <Link href="/logs?jenis=aktivitas" className={buttonVariants({ variant: "ghost" })}>
              Hapus filter
            </Link>
          )}
        </div>
      </FilterBar>

      <p className="text-sm text-muted-foreground">
        {total.toLocaleString("id-ID")} aktivitas{isFiltered ? " cocok dengan filter" : ""}.
      </p>

      <DataTable
        caption="Log aktivitas"
        sort={{ state: sortState, href: (st) => hrefForPage(1, pageSize, sortValue(st) === "when_desc" ? "" : sortValue(st)) }}
        columns={columns}
        rows={entries}
        getRowKey={(e) => e.id}
        empty={
          <EmptyState
            icon={History}
            title={isFiltered ? "Tidak ada aktivitas yang cocok." : "Belum ada aktivitas tercatat."}
          />
        }
      />

      <div className="flex flex-col gap-2">
        {pageCount > 1 && (
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={(p) => hrefForPage(p)}
            labels={{ previous: "Sebelumnya", next: "Berikutnya", pageOf: (p, n) => `Halaman ${p} dari ${n}` }}
            className="sm:justify-center"
          />
        )}
        <PageSizePicker value={pageSize} totalItems={total} hrefForSize={(n) => hrefForPage(1, n)} className="self-center sm:self-end" />
      </div>
    </div>
  );
}
