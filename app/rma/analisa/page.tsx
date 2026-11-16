import { requirePage } from "@/lib/page-access";
import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { AutoSubmitSelect } from "@/components/app/AutoSubmitSelect";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { HorizontalBars, LineChart, type BarItem, type LineBucket } from "@/components/toko/Charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  type DashboardCase,
  type Share,
} from "@/lib/rma/claim-dashboard";

export const metadata = { title: "Analisa Klaim — HNS IT Center" };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const TREND_MONTHS = 12;
const RANK_ROWS = 12;

type Search = { bulan?: string; lokasi?: string; milik?: string; status?: string };

const pctText = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** Bars for a share: the count and its part of the whole. */
function shareBars(shares: Share[]): BarItem[] {
  const all = shares.reduce((s, x) => s + x.count, 0);
  return shares.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.count,
    display: `${s.count} · ${all ? Math.round((s.count / all) * 100) : 0}%`,
    muted: s.muted,
  }));
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

/**
 * The RMA desk's monthly performance, laid out after the owner's Power BI
 * sheet: headline figures for the chosen month, the trend up to it, where the
 * month's cases went (LKL / ITR, user / store), and which vendors and brands
 * they were. Definitions are in lib/rma/claim-dashboard.ts.
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
  const bucket = (m: string, values: Record<string, number>): LineBucket => ({
    key: m,
    label: monthLabel(m),
    values,
    partial: m === thisMonth,
  });

  const inMonth = cases.filter((c) => c.handedOverAt >= range.start && c.handedOverAt < range.end);
  const vendors = ranking(inMonth, (c) => c.vendor);
  const brands = ranking(inMonth, (c) => c.brand);
  const rankBars = (r: Share[]): BarItem[] =>
    r.slice(0, RANK_ROWS).map((s) => ({ key: s.key, label: s.label, value: s.count, display: String(s.count) }));
  const filtered = Boolean(filter.location || filter.ownership || filter.status);

  return (
    <div data-slot="claim-analysis" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-6" /> Analisa Klaim
          </span>
        }
        description="Kinerja meja RMA per bulan. Tiket masuk = unit diserahkan ke RMA; selesai = case ditutup, tidak layak, atau dibatalkan."
      />

      <FilterBar action="/rma/analisa">
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Bulan" htmlFor="an-month" className="md:w-40">
            <AutoSubmitSelect id="an-month" name="bulan" defaultValue={month} key={`m-${month}`}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </AutoSubmitSelect>
          </FilterBarField>
          <FilterBarField label="Lokasi vendor" htmlFor="an-loc" className="md:w-44">
            <AutoSubmitSelect id="an-loc" name="lokasi" defaultValue={filter.location ?? ""} key={`l-${filter.location}`}>
              <option value="">Semua</option>
              <option value="in_town">{LOCATION_LABELS.in_town}</option>
              <option value="out_of_town">{LOCATION_LABELS.out_of_town}</option>
            </AutoSubmitSelect>
          </FilterBarField>
          <FilterBarField label="Kepemilikan" htmlFor="an-own" className="md:w-40">
            <AutoSubmitSelect id="an-own" name="milik" defaultValue={filter.ownership ?? ""} key={`o-${filter.ownership}`}>
              <option value="">Semua</option>
              <option value="customer">{OWNERSHIP_LABELS.customer}</option>
              <option value="store_stock">{OWNERSHIP_LABELS.store_stock}</option>
            </AutoSubmitSelect>
          </FilterBarField>
          <FilterBarField label="Status" htmlFor="an-status" className="md:w-40">
            <AutoSubmitSelect id="an-status" name="status" defaultValue={filter.status ?? ""} key={`s-${filter.status}`}>
              <option value="">Semua</option>
              <option value="open">Masih jalan</option>
              <option value="finished">Sudah selesai</option>
            </AutoSubmitSelect>
          </FilterBarField>
        </div>
        <Button type="submit">Terapkan</Button>
      </FilterBar>

      {allCases.length === 0 ? (
        <EmptyState icon={BarChart3} title="Belum ada klaim yang diserahkan ke RMA." />
      ) : (
        <>
          <section aria-label={`Ringkasan ${monthLabel(month)}`} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total tiket" value={f.total} hint={`Sampai akhir ${monthLabel(month)}`} />
            <StatCard label="Tiket masuk" value={f.masuk} hint="Diserahkan ke RMA bulan ini" />
            <StatCard label="Tiket selesai" value={f.selesai} hint="Ditutup bulan ini" />
            <StatCard label="Tiket aktif" value={f.aktif} hint={running ? "Masuk bulan ini, belum selesai" : "Masuk bulan ini, belum selesai di akhir bulan"} />
            <StatCard label="Avg lead time" value={f.avgLeadDays === null ? "—" : `${nf.format(f.avgLeadDays)} hari`} hint="Serah terima → selesai" />
            <StatCard label="Outstanding" value={f.outstanding} hint="Dari bulan lalu, belum selesai" />
            <StatCard label="Workload" value={f.workload} hint="Masuk + outstanding" />
            <StatCard label="Persentase selesai" value={pctText(f.selesaiRate)} hint="Selesai ÷ masuk" />
          </section>

          {filtered && (
            <p className="text-sm text-muted-foreground">
              Semua angka dan grafik di bawah hanya menghitung case yang cocok dengan filter. Status dibaca dari keadaan case sekarang.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Tiket masuk vs selesai" description={`Per bulan, sampai ${monthLabel(month)}.`}>
              <LineChart
                series={[
                  { key: "masuk", label: "Masuk", color: 0 },
                  { key: "selesai", label: "Selesai", color: 1 },
                ]}
                buckets={trend.map(({ m, f: x }) => bucket(m, { masuk: x.masuk, selesai: x.selesai }))}
              />
              {trend.some((t) => t.m === thisMonth) && <p className="text-xs text-muted-foreground">Garis putus-putus: bulan masih berjalan.</p>}
            </ChartCard>
            <ChartCard title="Workload dan outstanding" description="Workload = masuk + outstanding. Outstanding = sisa dari bulan sebelumnya.">
              <LineChart
                series={[
                  { key: "workload", label: "Workload", color: 0 },
                  { key: "outstanding", label: "Outstanding", color: 1 },
                ]}
                buckets={trend.map(({ m, f: x }) => bucket(m, { workload: x.workload, outstanding: x.outstanding }))}
              />
            </ChartCard>
            <ChartCard title="Rata-rata lead time" description="Hari dari serah terima ke RMA sampai selesai, untuk case yang selesai di bulan itu.">
              <LineChart
                series={[{ key: "v", label: "Lead time", color: 0 }]}
                buckets={trend.map(({ m, f: x }) => bucket(m, { v: x.avgLeadDays === null ? 0 : Math.round(x.avgLeadDays * 10) / 10 }))}
                unit="hari"
              />
              <p className="text-xs text-muted-foreground">Bulan tanpa case selesai tercatat 0.</p>
            </ChartCard>
            <ChartCard title="Persentase selesai" description="Selesai ÷ masuk per bulan. Bisa lebih dari 100% saat tumpukan lama ikut selesai.">
              <LineChart
                series={[{ key: "v", label: "Persentase selesai", color: 0 }]}
                buckets={trend.map(({ m, f: x }) => bucket(m, { v: x.selesaiRate === null ? 0 : Math.round(x.selesaiRate * 100) }))}
                unit="%"
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Distribusi lokasi vendor" description={`Tiket masuk ${monthLabel(month)}: LKL (dalam kota) vs ITR (luar kota).`}>
              <HorizontalBars items={shareBars(locationShares(inMonth))} empty="Belum ada tiket masuk di bulan ini." />
            </ChartCard>
            <ChartCard title="Distribusi kepemilikan" description={`Tiket masuk ${monthLabel(month)}: unit pelanggan vs stok toko.`}>
              <HorizontalBars items={inMonth.length ? shareBars(ownershipShares(inMonth)) : []} empty="Belum ada tiket masuk di bulan ini." />
            </ChartCard>
            <ChartCard title="Supplier ranking" description={`Tiket masuk ${monthLabel(month)} per vendor.`}>
              <HorizontalBars items={rankBars(vendors.rows)} empty="Belum ada tiket bulan ini yang dikirim ke vendor." />
              {vendors.missing > 0 && <p className="text-xs text-muted-foreground">{vendors.missing} tiket belum dikirim ke vendor, tidak dihitung.</p>}
            </ChartCard>
            <ChartCard title="Brand ranking" description={`Tiket masuk ${monthLabel(month)} per brand.`}>
              <HorizontalBars items={rankBars(brands.rows)} empty="Belum ada brand tercatat bulan ini." />
              {brands.missing > 0 && (
                <p className="text-xs text-muted-foreground">{brands.missing} tiket tanpa brand (unit diketik manual saat tiket dibuat), tidak dihitung.</p>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
