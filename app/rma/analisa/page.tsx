import { requirePage } from "@/lib/page-access";
import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { AutoSubmitSelect } from "@/components/app/AutoSubmitSelect";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import {
  HorizontalBars,
  LineChart,
  PieChart,
  StackedColumns,
  type BarItem,
  type LineBucket,
  type PieSlice,
  type StackedBucket,
} from "@/components/toko/Charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SERIES_COLORS } from "@/lib/chart-colors";
import { currentMonth, monthLabel, monthRange } from "@/lib/reports/parts";
import {
  locationShares,
  matchesFilter,
  monthFigures,
  monthsBetween,
  ownershipShares,
  ranking,
  readCaseFilter,
  shiftMonth,
  LOCATION_LABELS,
  OWNERSHIP_LABELS,
  type CaseFilter,
  type DashboardCase,
  type MonthFigures,
  type Share,
} from "@/lib/rma/claim-dashboard";

export const metadata = { title: "Analisa Klaim — HNS IT Center" };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const TREND_MONTHS = 12;

type Search = { bulan?: string; lokasi?: string; milik?: string; status?: string };

const pctText = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** LKL and user claims blue, ITR and store claims orange, the unknowns gray — fixed per entity. */
const SLICE_COLORS: Record<string, string> = {
  in_town: SERIES_COLORS[0],
  out_of_town: SERIES_COLORS[1],
  customer: SERIES_COLORS[0],
  store_stock: SERIES_COLORS[1],
  unknown: "#a8a29a",
  none: "#cfc9c0",
};
const slices = (shares: Share[]): PieSlice[] =>
  shares.map((s) => ({ key: s.key, label: s.label, value: s.count, color: SLICE_COLORS[s.key] ?? "#a8a29a" }));

const rankBars = (r: Share[]): BarItem[] => r.map((s) => ({ key: s.key, label: s.label, value: s.count, display: String(s.count) }));

/** One headline figure, as the sheet's top row has them: small label, large number. */
function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div data-slot="kpi" title={hint} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs">
      <span className="text-xs leading-tight font-semibold text-foreground">{label}</span>
      <span className="text-2xl leading-none font-bold text-primary tabular-nums">{value}</span>
      <span className="line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">{hint}</span>
    </div>
  );
}

function ChartCard({ title, description, center, children }: { title: string; description: string; center?: boolean; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base font-bold tracking-wide uppercase">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={center ? "flex flex-1 flex-col justify-center gap-2" : "flex flex-col gap-2"}>{children}</CardContent>
    </Card>
  );
}

/** Bulan, Lokasi, Kepemilikan, Status — two by two beside the figures on a wide screen, as on the sheet. */
function Filters({ month, months, filter }: { month: string; months: string[]; filter: CaseFilter }) {
  return (
    <FilterBar action="/rma/analisa" className="xl:grid xl:grid-cols-2 xl:items-end xl:gap-2 xl:self-start">
      <div className="grid grid-cols-2 gap-2 md:contents">
        <FilterBarField label="Bulan" htmlFor="an-month" className="md:w-40 xl:w-auto">
          <AutoSubmitSelect id="an-month" name="bulan" defaultValue={month} key={`m-${month}`}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </AutoSubmitSelect>
        </FilterBarField>
        <FilterBarField label="Lokasi" htmlFor="an-loc" className="md:w-40 xl:w-auto">
          <AutoSubmitSelect id="an-loc" name="lokasi" defaultValue={filter.location ?? ""} key={`l-${filter.location}`}>
            <option value="">Semua</option>
            <option value="in_town">{LOCATION_LABELS.in_town}</option>
            <option value="out_of_town">{LOCATION_LABELS.out_of_town}</option>
          </AutoSubmitSelect>
        </FilterBarField>
        <FilterBarField label="Kepemilikan" htmlFor="an-own" className="md:w-40 xl:w-auto">
          <AutoSubmitSelect id="an-own" name="milik" defaultValue={filter.ownership ?? ""} key={`o-${filter.ownership}`}>
            <option value="">Semua</option>
            <option value="customer">{OWNERSHIP_LABELS.customer}</option>
            <option value="store_stock">{OWNERSHIP_LABELS.store_stock}</option>
          </AutoSubmitSelect>
        </FilterBarField>
        <FilterBarField label="Status" htmlFor="an-status" className="md:w-40 xl:w-auto">
          <AutoSubmitSelect id="an-status" name="status" defaultValue={filter.status ?? ""} key={`s-${filter.status}`}>
            <option value="">Semua</option>
            <option value="open">Masih jalan</option>
            <option value="finished">Sudah selesai</option>
          </AutoSubmitSelect>
        </FilterBarField>
      </div>
      <Button type="submit" className="xl:col-span-2">
        Terapkan
      </Button>
    </FilterBar>
  );
}

/**
 * The RMA desk's monthly performance, laid out after the owner's Power BI
 * sheet: headline figures with the filters beside them; tickets in and out per
 * month; where the month's cases went (LKL / ITR, user / store) as pies; the
 * vendor and brand rankings down the right; and lead time, success rate,
 * workload and outstanding along the bottom. Definitions are in
 * lib/rma/claim-dashboard.ts.
 */
export default async function ClaimAnalysisPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePage("page_rma_analysis");
  const params = await searchParams;
  const filter = readCaseFilter(params);
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const thisMonth = currentMonth(now);

  const rows = await db.rmaCase.findMany({
    select: {
      handed_over_at: true,
      closed_at: true,
      unit_ownership: true,
      vendor_name: true,
      vendor: { select: { name: true, location: true } },
      ticket: { select: { device_brand: true } },
    },
  });
  const allCases: DashboardCase[] = rows.map((r) => ({
    handedOverAt: r.handed_over_at,
    closedAt: r.closed_at,
    ownership: r.unit_ownership,
    vendor: r.vendor?.name ?? r.vendor_name ?? null,
    vendorLocation: r.vendor?.location ?? null,
    brand: r.ticket.device_brand,
  }));
  const cases = allCases.filter((c) => matchesFilter(c, filter));

  // Months on offer: from the first handover to now, newest first.
  const first = allCases.reduce<Date | null>((m, c) => (!m || c.handedOverAt < m ? c.handedOverAt : m), null);
  const firstMonth = first ? currentMonth(first.getTime()) : thisMonth;
  const months = monthsBetween(firstMonth, thisMonth).reverse();
  const month = params.bulan && months.includes(params.bulan) ? params.bulan : thisMonth;
  const range = monthRange(month)!;
  const f = monthFigures(cases, range);
  const running = month === thisMonth;

  // The trend: up to twelve months ending with the chosen one, never before the first case.
  const trendStart = shiftMonth(month, -(TREND_MONTHS - 1));
  const trend = monthsBetween(trendStart > firstMonth ? trendStart : firstMonth, month).map((m) => ({
    m,
    f: monthFigures(cases, monthRange(m)!),
  }));
  const line = (pick: (x: MonthFigures) => number): LineBucket[] =>
    trend.map(({ m, f: x }) => ({ key: m, label: monthLabel(m), values: { v: pick(x) }, partial: m === thisMonth }));
  const columns = (pick: (x: MonthFigures) => number): StackedBucket[] =>
    trend.map(({ m, f: x }) => ({ key: m, label: monthLabel(m), values: { v: pick(x) }, total: pick(x), partial: m === thisMonth }));
  const one = [{ key: "v", label: "Tiket" }];

  const inMonth = cases.filter((c) => c.handedOverAt >= range.start && c.handedOverAt < range.end);
  const vendors = ranking(inMonth, (c) => c.vendor);
  const brands = ranking(inMonth, (c) => c.brand);
  const filtered = Boolean(filter.location || filter.ownership || filter.status);

  return (
    <div data-slot="claim-analysis" className="flex flex-col gap-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-6" /> Analisa Klaim
          </span>
        }
        description="RMA Performance Dashboard. Tiket masuk = unit diserahkan ke RMA; selesai = case ditutup, tidak layak, atau dibatalkan."
      />

      {allCases.length === 0 ? (
        <>
          <Filters month={month} months={months} filter={filter} />
          <EmptyState icon={BarChart3} title="Belum ada klaim yang diserahkan ke RMA." />
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <section aria-label={`Ringkasan ${monthLabel(month)}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
              <Kpi label="Total Tiket" value={f.total} hint={`Sampai akhir ${monthLabel(month)}`} />
              <Kpi label="Tiket Masuk" value={f.masuk} hint="Diserahkan ke RMA" />
              <Kpi label="Tiket Selesai" value={f.selesai} hint="Ditutup bulan ini" />
              <Kpi label="Tiket Aktif" value={f.aktif} hint={running ? "Masuk, belum selesai" : "Belum selesai di akhir bulan"} />
              <Kpi label="AVG LT (Hari)" value={f.avgLeadDays === null ? "—" : nf.format(f.avgLeadDays)} hint="Serah terima → selesai" />
              <Kpi label="Outstanding" value={f.outstanding} hint="Bulan lalu, belum selesai" />
              <Kpi label="Workload" value={f.workload} hint="Masuk + outstanding" />
              <Kpi label="Persentase Selesai" value={pctText(f.selesaiRate)} hint="Selesai ÷ masuk" />
            </section>
            <Filters month={month} months={months} filter={filter} />
          </div>

          {filtered && (
            <p className="text-sm text-muted-foreground">
              Semua angka dan grafik hanya menghitung case yang cocok dengan filter. Status dibaca dari keadaan case sekarang.
            </p>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
                <div className="grid min-w-0 gap-4 md:col-span-2 md:grid-cols-2 2xl:col-span-1 2xl:grid-cols-1">
                  <ChartCard title="Tiket Masuk" description="Jumlah tiket masuk per bulan">
                    <StackedColumns series={one} buckets={columns((x) => x.masuk)} valueLabels />
                  </ChartCard>
                  <ChartCard title="Tiket Selesai" description="Jumlah tiket selesai per bulan">
                    <StackedColumns series={one} buckets={columns((x) => x.selesai)} valueLabels />
                  </ChartCard>
                </div>
                <ChartCard center title="Distribusi Lokasi" description={`ITR (luar kota) vs LKL (dalam kota) · ${monthLabel(month)}`}>
                  <PieChart slices={slices(locationShares(inMonth))} empty="Belum ada tiket masuk di bulan ini." />
                </ChartCard>
                <ChartCard center title="Distribusi Kepemilikan" description={`Klaim User vs Klaim Toko · ${monthLabel(month)}`}>
                  <PieChart slices={slices(ownershipShares(inMonth))} empty="Belum ada tiket masuk di bulan ini." />
                </ChartCard>
              </div>

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <ChartCard title="Average Lead Time" description="Rata-rata lead time (hari)">
                  <LineChart
                    series={[{ key: "v", label: "Lead time", color: 0 }]}
                    buckets={line((x) => (x.avgLeadDays === null ? 0 : Math.round(x.avgLeadDays * 10) / 10))}
                    unit="hari"
                  />
                </ChartCard>
                <ChartCard title="Success Rate" description="Tiket selesai ÷ tiket masuk">
                  <StackedColumns
                    series={[{ key: "v", label: "Persentase selesai" }]}
                    buckets={columns((x) => (x.selesaiRate === null ? 0 : Math.round(x.selesaiRate * 100)))}
                    unit="%"
                    valueLabels
                  />
                </ChartCard>
                <ChartCard title="Workload" description="Tiket masuk + outstanding bulan lalu">
                  <LineChart series={[{ key: "v", label: "Workload", color: 0 }]} buckets={line((x) => x.workload)} />
                </ChartCard>
                <ChartCard title="Outstanding" description="Tiket bulan lalu belum selesai">
                  <LineChart series={[{ key: "v", label: "Outstanding", color: 0 }]} buckets={line((x) => x.outstanding)} />
                </ChartCard>
              </div>
            </div>

            <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
              <ChartCard title="Supplier Ranking" description={`Jumlah tiket per vendor · ${monthLabel(month)}`}>
                <div className="max-h-96 overflow-y-auto pr-1">
                  <HorizontalBars items={rankBars(vendors.rows)} empty="Belum ada tiket bulan ini yang dikirim ke vendor." />
                </div>
                {vendors.missing > 0 && <p className="text-xs text-muted-foreground">{vendors.missing} tiket belum dikirim ke vendor, tidak dihitung.</p>}
              </ChartCard>
              <ChartCard title="Brand Ranking" description={`Jumlah tiket per brand · ${monthLabel(month)}`}>
                <div className="max-h-96 overflow-y-auto pr-1">
                  <HorizontalBars items={rankBars(brands.rows)} empty="Belum ada brand tercatat bulan ini." />
                </div>
                {brands.missing > 0 && (
                  <p className="text-xs text-muted-foreground">{brands.missing} tiket tanpa brand (unit diketik manual), tidak dihitung.</p>
                )}
              </ChartCard>
            </div>
          </div>

          {trend.some((t) => t.m === thisMonth) && (
            <p className="text-xs text-muted-foreground">
              Kolom pudar dan garis putus-putus: bulan masih berjalan. Bulan tanpa case selesai: lead time tercatat 0.
            </p>
          )}
        </>
      )}
    </div>
  );
}
