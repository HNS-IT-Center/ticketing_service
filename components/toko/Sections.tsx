import { ChevronDown, Store } from "lucide-react";
import { formatDuration, PERIOD_LABELS, PERIOD_PRESETS, type CategoryRow, type Period } from "@/lib/store-dashboard";
import type { StoreDashboardData, DashboardStore } from "@/lib/store-dashboard-server";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

/** The pieces the kepala toko's pages share: the period filter and the performance tables. */

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type PeriodSearch = { period?: string; from?: string; to?: string; store?: string };

/** "/toko/x?period=…&store=…" for a change of period or store, keeping the rest. */
export function periodHref(basePath: string, period: Period, store: string | undefined, over: PeriodSearch = {}): string {
  const q = new URLSearchParams();
  const merged: PeriodSearch = { period: period.preset, store, ...over };
  if (merged.period && merged.period !== "month") q.set("period", merged.period);
  if (merged.period === "range") {
    q.set("from", merged.from ?? period.fromDay);
    q.set("to", merged.to ?? period.toDay);
  }
  if (merged.store) q.set("store", merged.store);
  const str = q.toString();
  return str ? `${basePath}?${str}` : basePath;
}

/** A kepala toko not (yet) put on any store. */
export function NoStores({ title }: { title: string }) {
  return (
    <div data-slot="store-none" className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState
        icon={Store}
        title="Anda belum ditugaskan ke toko mana pun."
        description="Minta admin menambahkan Anda sebagai kepala toko di Data Master → Stores."
      />
    </div>
  );
}

/** Period chips, a date range and — for more than one store — a store picker, on one line from md. */
export function PeriodFilter({
  basePath,
  period,
  stores,
  chosen,
}: {
  basePath: string;
  period: Period;
  stores: DashboardStore[];
  chosen?: DashboardStore;
}) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <FilterChips
        label="Periode"
        active={period.preset}
        chips={PERIOD_PRESETS.filter((p) => p !== "range").map((p) => ({
          key: p,
          label: PERIOD_LABELS[p],
          href: periodHref(basePath, period, chosen?.id, { period: p }),
        }))}
      />
      <FilterBar action={basePath}>
        <input type="hidden" name="period" value="range" />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Dari" htmlFor="pf-from" className="md:w-40">
            <Input id="pf-from" type="date" name="from" defaultValue={period.fromDay} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Sampai" htmlFor="pf-to" className="md:w-40">
            <Input id="pf-to" type="date" name="to" defaultValue={period.toDay} className="bg-card" />
          </FilterBarField>
        </div>
        {stores.length > 1 && (
          <FilterBarField label="Toko" htmlFor="pf-store" className="md:w-48">
            <NativeSelect id="pf-store" name="store" defaultValue={chosen?.id ?? ""}>
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
  );
}

export function perDayNote(t: StoreDashboardData["technicians"][number]): string {
  if (t.perDay === null) return "Belum ada tiket selesai";
  return t.perDayBasis === "scheduled"
    ? `${nf.format(t.perDay)} per hari kerja (${t.scheduledDays} hari terjadwal)`
    : `${nf.format(t.perDay)} per hari aktif (${t.activeDays} hari; jadwal kerja belum diatur)`;
}

const TECH_GRID = "md:grid-cols-[1fr_repeat(4,9rem)_1.5rem]";

export function TechnicianSection({ data }: { data: StoreDashboardData }) {
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

export function CategorySection({ rows }: { rows: CategoryRow[] }) {
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
