import Link from "next/link";
import { ChevronDown, ClipboardList, Clock, Gauge, Inbox, Store, UserX } from "lucide-react";
import { requireRole } from "@/lib/session";
import { storesFor, loadStoreDashboard, type StoreDashboardData } from "@/lib/store-dashboard-server";
import {
  INTAKE_TYPES,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  formatDuration,
  parsePeriod,
  type CategoryRow,
} from "@/lib/store-dashboard";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { UNKNOWN_KEY } from "@/lib/rma/claim-analysis";
import ChartSlider, { type Slide } from "@/components/toko/ChartSlider";
import { HorizontalBars, StackedColumns } from "@/components/toko/Charts";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Dashboard Toko — HNS IT Center" };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type Search = { period?: string; from?: string; to?: string; store?: string };

/**
 * The kepala toko's page (owner, 2026-11-09): read only. What came in, where
 * it stands, how much each technician finished and how long each kind of case
 * takes, and which brands come back under warranty — for their own stores. An
 * administrator sees the same page for any store.
 */
export default async function StoreDashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireRole("StoreSupervisor", "Administrator");
  const params = await searchParams;
  // One clock reading per request, passed down (the lib/rma/queue.ts rule).
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const period = parsePeriod(params, now);
  const stores = await storesFor(session);

  if (stores.length === 0) {
    return (
      <div data-slot="store-dashboard" className="flex flex-col gap-6">
        <PageHeader title="Dashboard Toko" />
        <EmptyState
          icon={Store}
          title="Anda belum ditugaskan ke toko mana pun."
          description="Minta admin menambahkan Anda sebagai kepala toko di Data Master → Stores."
        />
      </div>
    );
  }

  const chosen = stores.find((s) => s.id === params.store);
  const shown = chosen ? [chosen] : stores;
  const data = await loadStoreDashboard(shown.map((s) => s.id), period, now);
  const isAdmin = session.role === "Administrator";

  const href = (over: Partial<Search>) => {
    const q = new URLSearchParams();
    const merged: Search = { period: period.preset, store: chosen?.id, ...over };
    if (merged.period && merged.period !== "month") q.set("period", merged.period);
    if (merged.period === "range") {
      q.set("from", merged.from ?? period.fromDay);
      q.set("to", merged.to ?? period.toDay);
    }
    if (merged.store) q.set("store", merged.store);
    const s = q.toString();
    return s ? `/toko/dashboard?${s}` : "/toko/dashboard";
  };

  const storeLabel = shown.map((s) => s.name).join(", ");
  const working = data.pipeline.find((p) => p.key === "working")?.count ?? 0;
  const paused = data.pipeline.find((p) => p.key === "paused")?.count ?? 0;
  const unassigned = data.pipeline.find((p) => p.key === "unassigned")?.count ?? 0;

  return (
    <div data-slot="store-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Gauge aria-hidden className="size-6" /> Dashboard Toko
          </span>
        }
        description={`${storeLabel} · ${period.label}`}
      />

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Periode"
          active={period.preset}
          chips={PERIOD_PRESETS.filter((p) => p !== "range").map((p) => ({ key: p, label: PERIOD_LABELS[p], href: href({ period: p }) }))}
        />
        <FilterBar action="/toko/dashboard">
          <input type="hidden" name="period" value="range" />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterBarField label="Dari" htmlFor="td-from" className="md:w-44">
              <Input id="td-from" type="date" name="from" defaultValue={period.fromDay} className="bg-card" />
            </FilterBarField>
            <FilterBarField label="Sampai" htmlFor="td-to" className="md:w-44">
              <Input id="td-to" type="date" name="to" defaultValue={period.toDay} className="bg-card" />
            </FilterBarField>
          </div>
          {stores.length > 1 && (
            <FilterBarField label="Toko" htmlFor="td-store" className="md:w-56">
              <NativeSelect id="td-store" name="store" defaultValue={chosen?.id ?? ""}>
                <option value="">Semua toko</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
          )}
          <Button type="submit">Terapkan</Button>
        </FilterBar>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tiket masuk" value={nf.format(data.intakeTotal)} icon={Inbox} hint={period.label} />
        <StatCard label="Selesai dikerjakan" value={nf.format(data.finishedTotal)} icon={ClipboardList} tone="success" hint={period.label} />
        <StatCard label="Sedang dikerjakan" value={nf.format(working + paused)} icon={Clock} hint={paused ? `${paused} dijeda` : "Saat ini"} />
        <StatCard label="Menunggu teknisi" value={nf.format(unassigned)} icon={UserX} tone={unassigned ? "warning" : "default"} hint="Saat ini" />
      </div>

      <ChartSlider slides={slides(data)} />

      <TechnicianSection data={data} />
      <CategorySection rows={data.categories} />
      <OldestSection data={data} isAdmin={isAdmin} />
    </div>
  );
}

function slides(data: StoreDashboardData): Slide[] {
  const timed = (rows: { key: string; label: string; avgWorkMs: number | null; timed: number; group?: string }[]) =>
    rows
      .filter((r) => r.avgWorkMs !== null)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.avgWorkMs as number,
        display: formatDuration(r.avgWorkMs),
        note: `Rata-rata dari ${r.timed} tiket yang memakai timer`,
        muted: r.group === "parts",
      }));
  const claimBars = (rows: StoreDashboardData["claims"]["byBrand"]) =>
    rows.slice(0, 8).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.total,
      display: r.approvalRate === null ? nf.format(r.total) : `${nf.format(r.total)} · ${Math.round(r.approvalRate * 100)}% disetujui`,
      note: `Disetujui ${r.outcomes.approved} · Ditolak vendor ${r.outcomes.vendor_rejected} · Tidak layak ${r.outcomes.ineligible} · Masih berjalan ${r.outcomes.in_progress + r.outcomes.not_handed_over}`,
      muted: r.key === UNKNOWN_KEY,
    }));
  const claimColumn = (title: string, rows: StoreDashboardData["claims"]["byBrand"]) => (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <HorizontalBars empty="Belum ada klaim pada periode ini." items={claimBars(rows)} />
    </div>
  );

  return [
    {
      key: "intake",
      title: "Tiket masuk",
      subtitle: `${nf.format(data.intakeTotal)} tiket, per jenis`,
      content: (
        <StackedColumns
          series={INTAKE_TYPES.map((t) => ({ key: t, label: TICKET_TYPE_LABELS[t] }))}
          buckets={data.intake.map((b) => ({ key: b.key, label: b.label, values: b.counts, total: b.total }))}
        />
      ),
    },
    {
      key: "pipeline",
      title: "Posisi tiket sekarang",
      subtitle: "Tiket yang belum selesai diserahkan ke customer",
      content: (
        <HorizontalBars
          empty="Tidak ada tiket yang sedang berjalan."
          items={data.pipeline.map((p) => ({ key: p.key, label: p.label, value: p.count, display: nf.format(p.count) }))}
        />
      ),
    },
    {
      key: "finished",
      title: "Tiket selesai per teknisi",
      subtitle: "Dihitung saat tiket pertama kali selesai (klaim: saat diserahkan ke RMA)",
      content: (
        <HorizontalBars
          items={data.technicians.map((t) => ({
            key: t.id,
            label: t.name,
            value: t.finished,
            display: nf.format(t.finished),
            note: perDayNote(t),
          }))}
        />
      ),
    },
    {
      key: "work-time",
      title: "Rata-rata waktu kerja per teknisi",
      subtitle: "Waktu timer berjalan, jeda tidak dihitung",
      content: (
        <HorizontalBars
          items={data.technicians
            .filter((t) => t.avgWorkMs !== null)
            .map((t) => ({ key: t.id, label: t.name, value: t.avgWorkMs as number, display: formatDuration(t.avgWorkMs) }))}
        />
      ),
    },
    {
      key: "category-work",
      title: "Waktu kerja per kategori case",
      subtitle: "Rata-rata waktu timer berjalan per tiket",
      content: <HorizontalBars items={timed(data.categories)} />,
    },
    {
      key: "category-lead",
      title: "Lama sampai selesai per kategori case",
      subtitle: "Dari tiket masuk sampai selesai dikerjakan",
      content: (
        <HorizontalBars
          items={data.categories.map((r) => ({
            key: r.key,
            label: r.label,
            value: r.avgLeadMs ?? 0,
            display: formatDuration(r.avgLeadMs),
            note: `${r.count} tiket`,
            muted: r.group === "parts",
          }))}
        />
      ),
    },
    {
      key: "claims",
      title: "Klaim garansi",
      subtitle:
        `${nf.format(data.claims.total)} klaim masuk pada periode ini` +
        (data.claims.unknownBrand ? ` · ${data.claims.unknownBrand} belum punya brand (unit diketik manual)` : ""),
      content: (
        <div className="grid gap-6 lg:grid-cols-2">
          {claimColumn("Per brand", data.claims.byBrand)}
          {claimColumn("Per jenis barang", data.claims.byCategory)}
        </div>
      ),
    },
  ];
}

function perDayNote(t: StoreDashboardData["technicians"][number]): string {
  if (t.perDay === null) return "Belum ada tiket selesai";
  return t.perDayBasis === "scheduled"
    ? `${nf.format(t.perDay)} per hari kerja (${t.scheduledDays} hari terjadwal)`
    : `${nf.format(t.perDay)} per hari aktif (${t.activeDays} hari; jadwal kerja belum diatur)`;
}

const TECH_GRID = "md:grid-cols-[1fr_repeat(4,9rem)_1.5rem]";

function TechnicianSection({ data }: { data: StoreDashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Kinerja teknisi</CardTitle>
        <CardDescription>
          Per hari = tiket selesai dibagi hari teknisi terjadwal masuk (jadwal kerja, dikurangi cuti dan tukar shift). Teknisi
          yang jadwalnya belum diatur dihitung dari hari ia menyelesaikan tiket (hari aktif). Buka nama teknisi untuk rincian per
          kategori.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.technicians.length === 0 && <p className="text-sm text-muted-foreground">Belum ada teknisi di toko ini.</p>}
        {data.technicians.length > 0 && (
          <div aria-hidden className={`hidden gap-x-4 px-4 text-xs font-medium text-muted-foreground md:grid ${TECH_GRID}`}>
            <span>Teknisi</span>
            <span>Selesai</span>
            <span>Per hari</span>
            <span>Waktu kerja (rata-rata)</span>
            <span>Sedang dikerjakan</span>
            <span />
          </div>
        )}
        {data.technicians.map((t) => (
          <details key={t.id} className="group rounded-lg border border-border bg-card">
            <summary className={`grid cursor-pointer list-none grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${TECH_GRID} [&::-webkit-details-marker]:hidden`}>
              <span className="col-span-2 font-semibold text-foreground md:col-span-1">{t.name}</span>
              <Figure label="Selesai" value={nf.format(t.finished)} />
              <Figure
                label="Per hari"
                value={t.perDay === null ? "—" : nf.format(t.perDay)}
                hint={t.perDayBasis === "active" ? `hari aktif (${t.activeDays})` : t.perDayBasis === "scheduled" ? `${t.scheduledDays} hari terjadwal` : undefined}
              />
              <Figure label="Waktu kerja" value={formatDuration(t.avgWorkMs)} />
              <Figure label="Dikerjakan" value={`${t.active}${t.paused ? ` (${t.paused} jeda)` : ""}`} />
              <ChevronDown aria-hidden className="hidden size-4 text-muted-foreground transition-transform group-open:rotate-180 md:block" />
            </summary>
            <div className="border-t border-border px-4 py-3">
              {t.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada tiket selesai pada periode ini.</p>
              ) : (
                <CategoryTable rows={t.categories} caption={`Rincian kategori ${t.name}`} />
              )}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </span>
  );
}

const categoryColumns: DataTableColumn<CategoryRow>[] = [
  {
    key: "label",
    header: "Kategori",
    mobile: "title",
    cell: (r) => <span className={r.group === "parts" ? "pl-4 text-muted-foreground" : "font-semibold"}>{r.label}</span>,
  },
  { key: "count", header: "Tiket", mobile: "badge", cell: (r) => nf.format(r.count) },
  { key: "work", header: "Waktu kerja (rata-rata)", mobileLabel: "Waktu kerja", cell: (r) => formatDuration(r.avgWorkMs) },
  { key: "lead", header: "Sampai selesai (rata-rata)", mobileLabel: "Sampai selesai", cell: (r) => formatDuration(r.avgLeadMs) },
  {
    key: "timed",
    header: "Pakai timer",
    mobileLabel: "Pakai timer",
    cell: (r) => `${r.timed} dari ${r.count}`,
  },
];

function CategoryTable({ rows, caption }: { rows: CategoryRow[]; caption: string }) {
  return <DataTable columns={categoryColumns} rows={rows} getRowKey={(r) => r.key} caption={caption} />;
}

function CategorySection({ rows }: { rows: CategoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Lama pengerjaan per kategori case</CardTitle>
        <CardDescription>
          Waktu kerja = timer berjalan, jeda tidak dihitung. Sampai selesai = dari tiket masuk sampai selesai dikerjakan. Ganti
          sparepart dirinci dari part yang dicatat di tiket; service tanpa catatan part masuk &ldquo;Service lainnya&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada tiket selesai pada periode ini.</p>
        ) : (
          <CategoryTable rows={rows} caption="Lama pengerjaan per kategori" />
        )}
      </CardContent>
    </Card>
  );
}

function OldestSection({ data, isAdmin }: { data: StoreDashboardData; isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Paling lama belum selesai</CardTitle>
        <CardDescription>Tiket yang masih menunggu atau sedang dikerjakan, yang paling lama di toko lebih dulu.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.oldest.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada tiket yang tertahan.</p>}
        {data.oldest.map((t) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-sm font-semibold text-foreground">{t.code}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {TICKET_TYPE_LABELS[t.ticketType]}
                  {t.deviceName ? ` · ${t.deviceName}` : ""} · {t.technicianName ?? "Belum ada teknisi"}
                </span>
              </span>
              <span
                className={
                  t.ageDays >= 7
                    ? "shrink-0 rounded-full border border-tone-red-border bg-tone-red-bg px-2.5 py-0.5 text-xs font-semibold text-tone-red-fg"
                    : "shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground"
                }
              >
                {t.ageDays} hari
              </span>
            </>
          );
          const cls = "flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3";
          return isAdmin ? (
            <Link key={t.id} href={`/admin/tickets/${t.id}`} className={`${cls} hover:bg-muted`}>
              {body}
            </Link>
          ) : (
            <div key={t.id} className={cls}>
              {body}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
