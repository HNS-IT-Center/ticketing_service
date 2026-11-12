import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import { Target, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { summarizeTargets, type JobCount, type TechnicianTarget } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { resolveReportMonth } from "@/lib/reports/parts-data";
import { monthLabel } from "@/lib/reports/parts";
import { DEFAULT_SCOPE, defaultTarget, progress, targetFor } from "@/lib/reports/targets";
import { loadTargetRows } from "@/lib/reports/targets-data";
import ProgressBar from "@/components/targets/ProgressBar";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import TargetEditor from "./TargetEditor";

export const metadata = { title: "Target Teknisi — HNS IT Center" };

export default async function TechnicianTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string }>;
}) {
  const session = await requirePage("page_tech_targets");
  // Seeing the targets can be granted; setting them stays the administrator's.
  const canEdit = session.role === "Administrator";
  const params = await searchParams;
  const month = resolveReportMonth(params.month);
  const storeId = params.store || null;

  const [stores, data, targetRows] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadTargetData(month, storeId),
    loadTargetRows(month),
  ]);
  const summary = summarizeTargets(data?.technicians ?? [], data?.doneTickets ?? [], data?.lines ?? []);
  const { totals } = summary;
  const shopTarget = defaultTarget(targetRows, month);
  const monthText = monthLabel(month);

  const sourceLabel = (source: string) =>
    source === "custom" ? "Khusus" : source === "default" ? "Umum" : "Tanpa target";

  const editor = (r: TechnicianTarget, className?: string) => {
    if (!canEdit) return null;
    const target = targetFor(targetRows, r.technician.id, month);
    return (
      <TargetEditor
        scope={r.technician.id}
        month={month}
        monthText={monthText}
        initial={target}
        buttonLabel="Atur"
        title={`Target ${r.technician.name}`}
        canUseDefault={target.source === "custom"}
        className={className}
      />
    );
  };

  const columns: DataTableColumn<TechnicianTarget>[] = [
    { key: "name", sortValue: (r) => r.technician.name, header: "Teknisi", mobile: "title", cell: (r) => <span className="font-semibold">{r.technician.name}</span> },
    {
      key: "source",
      header: "Target",
      mobile: "badge",
      // The phone card's top-right label; on desktop it sits in the Target column.
      className: "hidden",
      cell: (r) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {sourceLabel(targetFor(targetRows, r.technician.id, month).source)}
        </span>
      ),
    },
    { key: "tickets", sortValue: (r) => r.tickets, sortFirst: "desc", header: "Tiket", cell: (r) => r.tickets },
    {
      key: "jobs", sortValue: (r) => r.jobs, sortFirst: "desc",
      header: "Jasa",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span>
            {r.jobs}
            {r.untyped > 0 && <span className="text-xs text-tone-amber-fg"> (+{r.untyped} diketik)</span>}
          </span>
          <ProgressBar progress={progress(r.jobs, targetFor(targetRows, r.technician.id, month).jobs)} />
        </div>
      ),
    },
    {
      key: "revenue", sortValue: (r) => r.revenue, sortFirst: "desc",
      header: "Omzet jasa",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="whitespace-nowrap">
            {formatRupiah(r.revenue)}
            {r.unpriced > 0 && <span className="text-xs whitespace-normal text-tone-amber-fg"> ({r.unpriced} tanpa harga)</span>}
          </span>
          <ProgressBar
            progress={progress(r.revenue, targetFor(targetRows, r.technician.id, month).revenue)}
            format={formatRupiahCompact}
          />
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
    {
      key: "byJob",
      header: "Rincian jasa",
      cell: (r) =>
        r.byJob.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <details>
            <summary className="cursor-pointer font-medium text-primary">{r.byJob.length} jenis jasa</summary>
            <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-5 text-sm">
              {r.byJob.map((j) => (
                <li key={j.jobId}>
                  {j.name} <strong>× {j.count}</strong>
                </li>
              ))}
            </ul>
          </details>
        ),
    },
    {
      key: "target",
      header: "Target",
      mobile: "hidden",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">{sourceLabel(targetFor(targetRows, r.technician.id, month).source)}</span>
          {editor(r)}
        </div>
      ),
    },
    { key: "edit", header: "Atur target", mobile: "footer", className: "hidden", cell: (r) => editor(r, "w-full") },
  ];

  const jobColumns: DataTableColumn<JobCount>[] = [
    { key: "name", sortValue: (j) => j.name, header: "Jasa", mobile: "title", cell: (j) => j.name },
    { key: "count", sortValue: (j) => j.count, sortFirst: "desc", header: "Dikerjakan", mobile: "badge", cell: (j) => <span className="font-semibold">{j.count}×</span> },
  ];

  const sectionTitle = "text-base font-semibold text-foreground";

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-targets" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Target aria-hidden="true" className="size-6" /> Target Teknisi
          </span>
        }
        description={
          <>
            Pekerjaan tiket service yang <strong className="text-foreground">pertama kali selesai (Done)</strong> di bulan
            ini, dikreditkan ke teknisi tiketnya. Jasa dihitung dari Daftar Jasa: berapa kali dikerjakan, omzetnya (harga
            jual × jumlah), dan poinnya. Poin di sini ukuran target sendiri, tidak masuk Leaderboard.
          </>
        }
      />

      <FilterBar action="/admin/reports/technicians">
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Bulan" htmlFor="targets-month">
            <Input id="targets-month" type="month" name="month" defaultValue={month} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Toko" htmlFor="targets-store">
            <NativeSelect id="targets-store" name="store" defaultValue={storeId ?? ""}>
              <option value="">Semua toko</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
        </div>
        <Button type="submit">Tampilkan</Button>
      </FilterBar>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between md:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={sectionTitle}>Target umum per teknisi — {monthText}</h2>
          {shopTarget.source === "none" ? (
            <p className="text-sm text-muted-foreground">
              Belum ada target. Atur di sini; teknisi juga bisa diberi target khusus di tabel di bawah.
            </p>
          ) : (
            <p className="text-sm">
              {[
                shopTarget.jobs !== null && `${shopTarget.jobs} jasa`,
                shopTarget.revenue !== null && `omzet ${formatRupiah(shopTarget.revenue)}`,
                shopTarget.points !== null && `${shopTarget.points} poin`,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              <span className="text-muted-foreground">— berlaku sejak {monthLabel(shopTarget.since!)}</span>
            </p>
          )}
        </div>
        {canEdit && <TargetEditor
          scope={DEFAULT_SCOPE}
          month={month}
          monthText={monthText}
          initial={shopTarget}
          buttonLabel={shopTarget.source === "none" ? "Atur target umum" : "Ubah target umum"}
          title="Target umum per teknisi"
          className="w-full shrink-0 sm:w-auto"
        />}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={totals.tickets} label="Tiket selesai" />
        <StatCard value={totals.jobs} label="Jasa dikerjakan" />
        <StatCard value={formatRupiahCompact(totals.revenue)} label="Omzet jasa" />
        <StatCard value={totals.points} label="Poin jasa" />
      </div>

      {(totals.unpriced > 0 || totals.untyped > 0) && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-1.5">
            {totals.unpriced > 0 && <p>{totals.unpriced} baris jasa belum ada harga jual — omzet di bawah belum lengkap.</p>}
            {totals.untyped > 0 && (
              <p>
                {totals.untyped} jasa masih diketik bebas (sebelum Daftar Jasa) — terhitung sebagai pekerjaan, tapi tidak
                per jenis dan tanpa poin.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={sectionTitle}>Per teknisi</h2>
        <DataTable
          caption="Target per teknisi"
          sort={urlSort("/admin/reports/technicians", params, "sort_target")}
          columns={columns}
          rows={summary.rows}
          getRowKey={(r) => r.technician.id}
          empty={
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Belum ada teknisi aktif{storeId ? " di toko ini" : ""}.
            </p>
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={sectionTitle}>Jasa terbanyak</h2>
        <DataTable
          caption="Jasa terbanyak"
          sort={urlSort("/admin/reports/technicians", params, "sort_jobs")}
          columns={jobColumns}
          rows={summary.jobs}
          getRowKey={(j) => j.jobId}
          empty={
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Belum ada jasa dari Daftar Jasa pada periode ini.
            </p>
          }
        />
      </section>
    </div>
  );
}
