import { ClipboardList, Clock, Gauge, Inbox, UserX } from "lucide-react";
import { loadStoreDashboard, type StoreDashboardData } from "@/lib/store-dashboard-server";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { INTAKE_TYPES, formatDuration, parsePeriod } from "@/lib/store-dashboard";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { UNKNOWN_KEY } from "@/lib/rma/claim-analysis";
import ChartSlider, { type Slide } from "@/components/toko/ChartSlider";
import { HorizontalBars, StackedColumns } from "@/components/toko/Charts";
import { NoStores, PeriodFilter, perDayNote } from "@/components/toko/Sections";
import { FollowupCard } from "@/components/toko/Followups";
import { loadFollowups } from "@/lib/store-followups-server";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";

export const metadata = { title: "Dashboard Toko — HNS IT Center" };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type Search = { period?: string; from?: string; to?: string; store?: string };

/**
 * The kepala toko's first page (owner, 2026-11-09): one screen, no scrolling —
 * the four numbers, the chart slider, and the three tickets waiting longest.
 * The tables live on their own pages (Kinerja Teknisi, Tiket Toko, …).
 */
export default async function StoreDashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer("page_toko_dashboard");
  const params = await searchParams;
  // One clock reading per request, passed down (the lib/rma/queue.ts rule).
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const period = parsePeriod(params, now);
  if (stores.length === 0) return <NoStores title="Dashboard Toko" />;

  const { chosen, shown, ids } = pickStores(stores, params.store);
  const [data, followups] = await Promise.all([loadStoreDashboard(ids, period, now), loadFollowups(ids, now)]);

  const working = data.pipeline.find((p) => p.key === "working")?.count ?? 0;
  const paused = data.pipeline.find((p) => p.key === "paused")?.count ?? 0;
  const unassigned = data.pipeline.find((p) => p.key === "unassigned")?.count ?? 0;

  return (
    <div data-slot="store-dashboard" className="flex flex-col gap-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Gauge aria-hidden className="size-6" /> Dashboard Toko
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${period.label}`}
        // Beside the title rather than under it, so the page fits one screen.
        actions={<PeriodFilter basePath="/toko/dashboard" period={period} stores={stores} chosen={chosen} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tiket masuk" value={nf.format(data.intakeTotal)} icon={Inbox} hint={period.label} />
        <StatCard label="Selesai dikerjakan" value={nf.format(data.finishedTotal)} icon={ClipboardList} tone="success" hint={period.label} />
        <StatCard label="Sedang dikerjakan" value={nf.format(working + paused)} icon={Clock} hint={paused ? `${paused} dijeda` : "Saat ini"} />
        <StatCard
          label="Menunggu teknisi"
          value={nf.format(unassigned)}
          icon={UserX}
          tone={unassigned ? "warning" : "default"}
          hint="Saat ini"
          href={`/toko/tickets?status=unassigned${chosen ? `&store=${chosen.id}` : ""}`}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ChartSlider slides={slides(data)} />
        <FollowupCard followups={followups} store={chosen?.id} />
      </div>
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
