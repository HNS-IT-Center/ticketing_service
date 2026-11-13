import { Suspense } from "react";
import { CheckCircle, ChevronDown, Inbox, Wallet } from "lucide-react";
import { requireRole } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { requestNow } from "@/lib/clock";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { backlogText } from "@/lib/admin-dashboard";
import { loadAdminDashboard } from "@/lib/admin-dashboard-server";
import { monthLabel } from "@/lib/reports/parts";
import {
  DEFAULT_GRAIN,
  GRAINS,
  GRAIN_LABELS,
  PERIODE_PARAM,
  TYPE_LABELS,
  TYPE_ORDER,
  parsePeriode,
  periodText,
  type Grain,
  type TrendRow,
} from "@/lib/trend";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard, StatCardSkeleton } from "@/components/app/StatCard";
import ChartSlider, { type Slide } from "@/components/toko/ChartSlider";
import { LineChart, StackedColumns, type LineBucket } from "@/components/toko/Charts";
import { AttentionRow, DeltaHint, HeldClaimsCard, StoreSection, TechnicianSection } from "@/components/dashboard/BusinessSections";

export const metadata = { title: "Ringkasan Bisnis — HNS IT Center" };

const nf = new Intl.NumberFormat("id-ID");

/** The bucket a chart point stands for, in words: "per hari", "per bulan". */
const BUCKET_WORD: Record<Grain, string> = { day: "hari", week: "minggu", month: "bulan", quarter: "kuartal", year: "tahun" };

/**
 * Ringkasan Bisnis (owner, 2026-11-13): one page for every administrator, the
 * boss included. The period picked at the top drives every figure except
 * "Perlu perhatian", which is today's state. Money — takings and money held in
 * claims — shows only to a viewer allowed `view_finance_report`; for anyone
 * else it is not rendered at all, so it is not in the page source either.
 */
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const session = await requireRole("Administrator");
  const params = await searchParams;
  const now = requestNow();
  const grain = parsePeriode(params.periode);

  const [access, data] = await Promise.all([accessFor(session.userId), loadAdminDashboard(grain, now)]);
  const money = access.can("view_finance_report");
  const mayValueClaims = money && access.can("view_cost");

  const dates = periodText(grain, now);
  const head = Object.fromEntries(data.headlines.map((h) => [h.metric, h]));
  const per = BUCKET_WORD[grain];
  const last = data.rows.length - 1;
  const monthText = monthLabel(data.month);

  const typeText = (r: TrendRow) =>
    TYPE_ORDER.filter((t) => r.createdByType[t] > 0)
      .map((t) => `${TYPE_LABELS[t]} ${r.createdByType[t]}`)
      .join(", ");

  const flowBuckets: LineBucket[] = data.rows.map((r, i) => ({
    key: r.key,
    label: r.label,
    longLabel: r.longLabel,
    values: { created: r.created, finished: r.finished },
    details: { created: typeText(r) },
    note: backlogText(r.created, r.finished),
    partial: i === last,
  }));
  const single = (pick: (r: TrendRow) => number) =>
    data.rows.map((r, i) => ({ key: r.key, label: r.label, longLabel: r.longLabel, values: { v: pick(r) }, total: pick(r), partial: i === last }));
  const unpricedInWindow = data.rows.reduce((s, r) => s + r.unpriced, 0);

  const slides: Slide[] = [
    {
      key: "flow",
      title: "Tiket masuk vs selesai",
      subtitle: `Total semua jenis tiket per ${per}. Jarak dua garis = tumpukan bertambah atau berkurang.`,
      content: (
        <div className="flex flex-col gap-2">
          <LineChart
            series={[
              { key: "created", label: "Masuk", color: 0 },
              { key: "finished", label: "Selesai", color: 1 },
            ]}
            buckets={flowBuckets}
          />
          <p className="text-xs text-muted-foreground">
            Selesai di suatu {per} bisa tiket dari {per} sebelumnya, jadi grafik ini membaca arus kerja, bukan umur tiket. Klaim garansi
            dihitung selesai saat diserahkan ke RMA.
          </p>
        </div>
      ),
    },
    ...(money
      ? [
          {
            key: "takings",
            title: "Pendapatan",
            subtitle: `Harga jual di Rincian Biaya tiket yang selesai, per ${per}.`,
            content: (
              <div className="flex flex-col gap-2">
                <StackedColumns series={[{ key: "v", label: "Pendapatan" }]} buckets={single((r) => r.takings)} format="rupiah" />
                <p className="text-xs text-muted-foreground">
                  Kolom pudar: {per} masih berjalan.
                  {unpricedInWindow > 0 && ` ${nf.format(unpricedInWindow)} baris biaya belum ada harga jual dan tidak ikut dijumlah.`}
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "points",
      title: "Poin teknisi",
      subtitle: `Total poin seluruh teknisi per ${per}.`,
      content: (
        <div className="flex flex-col gap-2">
          <LineChart series={[{ key: "v", label: "Poin", color: 0 }]} buckets={single((r) => r.points)} unit="poin" />
          <p className="text-xs text-muted-foreground">Tiket yang poinnya dihapus tidak ikut dihitung. Garis putus-putus: {per} masih berjalan.</p>
        </div>
      ),
    },
    {
      key: "types",
      title: "Tiket masuk per jenis",
      subtitle: `Komposisi tiket masuk per ${per}.`,
      content: (
        <StackedColumns
          series={TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABELS[t] }))}
          buckets={data.rows.map((r, i) => ({ key: r.key, label: r.label, longLabel: r.longLabel, values: r.createdByType, total: r.created, partial: i === last }))}
        />
      ),
    },
  ];

  const tableColumns: DataTableColumn<TrendRow>[] = [
    { key: "period", header: "Periode", cell: (r) => r.longLabel, mobile: "title" },
    { key: "created", header: "Masuk", cell: (r) => nf.format(r.created), className: "text-right tabular-nums" },
    { key: "finished", header: "Selesai", cell: (r) => nf.format(r.finished), className: "text-right tabular-nums" },
    { key: "cancelled", header: "Batal / ditolak", cell: (r) => nf.format(r.cancelled), className: "text-right tabular-nums" },
    ...(money
      ? [
          { key: "takings", header: "Pendapatan", cell: (r: TrendRow) => formatRupiah(r.takings), className: "text-right tabular-nums" },
          { key: "unpriced", header: "Tanpa harga", cell: (r: TrendRow) => nf.format(r.unpriced), className: "text-right tabular-nums" },
        ]
      : []),
    { key: "points", header: "Poin", cell: (r) => nf.format(r.points), className: "text-right tabular-nums" },
  ];

  const periodeHref = (g: Grain) => (g === DEFAULT_GRAIN ? "/admin/dashboard" : `/admin/dashboard?periode=${PERIODE_PARAM[g]}`);

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title="Ringkasan Bisnis"
        description={`Semua toko · ${dates.current} · dibanding ${dates.previous}`}
      />

      <FilterChips label="Periode" active={grain} chips={GRAINS.map((g) => ({ key: g, label: GRAIN_LABELS[g], href: periodeHref(g) }))} />

      <div className={money ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}>
        {money && (
          <StatCard
            label="Pendapatan"
            value={formatRupiahCompact(data.totals.takings)}
            icon={Wallet}
            hint={
              <span className="flex flex-col gap-0.5">
                <DeltaHint h={head.takings} money />
                {data.totals.unpriced > 0 && <span className="text-tone-amber-fg">{nf.format(data.totals.unpriced)} baris belum ada harga</span>}
              </span>
            }
          />
        )}
        <StatCard label="Tiket masuk" value={nf.format(data.totals.created)} icon={Inbox} href="/admin/tickets" hint={<DeltaHint h={head.created} />} />
        <StatCard label="Tiket selesai" value={nf.format(data.totals.finished)} icon={CheckCircle} hint={<DeltaHint h={head.finished} />} />
        <Suspense fallback={<StatCardSkeleton />}>
          <HeldClaimsCard now={now} mayValue={mayValueClaims} />
        </Suspense>
      </div>

      <div className="flex flex-col gap-3">
        <ChartSlider slides={slides} label="Grafik ringkasan bisnis" />
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Lihat angka grafik dalam tabel
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border p-4">
            <DataTable caption={`Per ${per}`} columns={tableColumns} rows={[...data.rows].reverse()} getRowKey={(r) => r.key} />
          </div>
        </details>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <StoreSection stores={data.stores} money={money} />
        <TechnicianSection teams={data.teams} monthText={monthText} />
      </div>

      <AttentionRow a={data.attention} />
    </div>
  );
}
