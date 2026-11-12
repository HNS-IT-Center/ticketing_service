import { Target, Users } from "lucide-react";
import { urlSort } from "@/lib/table-sort";
import { loadStoreDashboard } from "@/lib/store-dashboard-server";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { parsePeriod } from "@/lib/store-dashboard";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { summarizeTargets, type TechnicianTarget } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { monthLabel } from "@/lib/reports/parts";
import { progress, targetFor } from "@/lib/reports/targets";
import { loadTargetRows } from "@/lib/reports/targets-data";
import ProgressBar from "@/components/targets/ProgressBar";
import { CategorySection, NoStores, PeriodFilter, TechnicianSection } from "@/components/toko/Sections";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Kinerja Teknisi — HNS IT Center" };

type Search = { period?: string; from?: string; to?: string; store?: string };

/**
 * Per technician of the kepala toko's store: how many tickets they finished,
 * per working day, how long they work on a case, by kind of case — and how
 * this month stands against the target the admin set. Read only.
 */
export default async function StoreTechniciansPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer("page_toko_performance");
  const params = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const period = parsePeriod(params, now);
  if (stores.length === 0) return <NoStores title="Kinerja Teknisi" />;

  const { chosen, shown, ids } = pickStores(stores, params.store);
  // The target is per month and per store: the month the period starts in,
  // for the one store on screen.
  const month = period.fromDay.slice(0, 7);
  const targetStore = shown.length === 1 ? shown[0] : null;
  const [data, targetData, targetRows] = await Promise.all([
    loadStoreDashboard(ids, period, now),
    targetStore ? loadTargetData(month, targetStore.id) : Promise.resolve(null),
    targetStore ? loadTargetRows(month) : Promise.resolve([]),
  ]);
  const targets = targetData ? summarizeTargets(targetData.technicians, targetData.doneTickets, targetData.lines) : null;

  const targetColumns: DataTableColumn<TechnicianTarget>[] = [
    { key: "name", sortValue: (r) => r.technician.name, header: "Teknisi", mobile: "title", cell: (r) => <span className="font-semibold">{r.technician.name}</span> },
    { key: "tickets", sortValue: (r) => r.tickets, sortFirst: "desc", header: "Tiket service", mobile: "badge", cell: (r) => r.tickets },
    {
      key: "jobs", sortValue: (r) => r.jobs, sortFirst: "desc",
      header: "Jasa",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span>{r.jobs}</span>
          <ProgressBar progress={progress(r.jobs, targetFor(targetRows, r.technician.id, month).jobs)} />
        </div>
      ),
    },
    {
      key: "revenue", sortValue: (r) => r.revenue, sortFirst: "desc",
      header: "Omzet jasa",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="whitespace-nowrap">{formatRupiah(r.revenue)}</span>
          <ProgressBar progress={progress(r.revenue, targetFor(targetRows, r.technician.id, month).revenue)} format={formatRupiahCompact} />
        </div>
      ),
    },
    {
      key: "points", sortValue: (r) => r.points, sortFirst: "desc",
      header: "Poin",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <strong>{r.points}</strong>
          <ProgressBar progress={progress(r.points, targetFor(targetRows, r.technician.id, month).points)} />
        </div>
      ),
    },
  ];

  return (
    <div data-slot="store-technicians" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Users aria-hidden className="size-6" /> Kinerja Teknisi
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${period.label}`}
      />
      <PeriodFilter basePath="/toko/teknisi" period={period} stores={stores} chosen={chosen} />

      <TechnicianSection data={data} />
      <CategorySection rows={data.categories} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Target aria-hidden className="size-4 text-primary" /> Target bulan {monthLabel(month)}
          </CardTitle>
          <CardDescription>
            Tiket service yang pertama kali selesai di bulan ini, dihitung dari Daftar Jasa — sama dengan laporan Target Teknisi
            admin. Targetnya diatur oleh admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!targetStore ? (
            <p className="text-sm text-muted-foreground">Pilih satu toko untuk melihat target.</p>
          ) : !targets || targets.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada teknisi di toko ini.</p>
          ) : (
            <DataTable sort={urlSort("/toko/teknisi", params)} columns={targetColumns} rows={targets.rows} getRowKey={(r) => r.technician.id} caption={`Target ${monthLabel(month)}`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
