import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import Link from "next/link";
import { BarChart3, Info } from "lucide-react";
import { db } from "@/lib/db";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeClaims, CLAIM_OUTCOME_LABELS, UNKNOWN_KEY, type BreakdownRow } from "@/lib/rma/claim-analysis";
import { wibDayStart } from "@/lib/activity-list";

export const metadata = { title: "Analisa Klaim — HNS IT Center" };

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

/**
 * Which brands and which kinds of goods come back under warranty, and how the
 * claims end. Counts every warranty-claim ticket created in the period, by the
 * brand and category picked from the Accurate catalogue at intake.
 */
export default async function ClaimAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePage("page_rma_analysis");
  const params = await searchParams;
  const from = wibDayStart(params.from);
  const toStart = wibDayStart(params.to);
  const to = toStart ? new Date(toStart.getTime() + 24 * 3600_000) : null;

  const claims = await db.ticket.findMany({
    where: {
      ticket_type: "warranty_claim",
      ...(from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    },
    select: {
      device_brand: true,
      device_catalog_category: true,
      device_sku: true,
      device_name: true,
      rma_case: { select: { status: true, decision: true } },
    },
  });
  const a = analyzeClaims(claims);
  const isFiltered = Boolean(from || to);

  const columns = (first: string): DataTableColumn<BreakdownRow>[] => [
    {
      key: "label", sortValue: (r) => r.label,
      header: first,
      mobile: "title",
      cell: (r) => (
        <span className={r.key === UNKNOWN_KEY ? "text-muted-foreground italic" : "font-semibold"}>{r.label}</span>
      ),
    },
    {
      key: "total", sortValue: (r) => r.total, sortFirst: "desc",
      header: "Klaim",
      mobile: "badge",
      cell: (r) => (
        <span className="flex min-w-28 items-center gap-2">
          <span className="w-8 text-right font-semibold tabular-nums">{r.total}</span>
          <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-muted md:block" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: pct(r.total, a.total) }} />
          </span>
          <span className="w-10 text-xs text-muted-foreground tabular-nums">{pct(r.total, a.total)}</span>
        </span>
      ),
    },
    { key: "approved", sortValue: (r) => r.outcomes.approved, sortFirst: "desc", header: CLAIM_OUTCOME_LABELS.approved, cell: (r) => r.outcomes.approved || "—" },
    { key: "vendor_rejected", sortValue: (r) => r.outcomes.vendor_rejected, sortFirst: "desc", header: CLAIM_OUTCOME_LABELS.vendor_rejected, cell: (r) => r.outcomes.vendor_rejected || "—" },
    { key: "ineligible", sortValue: (r) => r.outcomes.ineligible, sortFirst: "desc", header: CLAIM_OUTCOME_LABELS.ineligible, cell: (r) => r.outcomes.ineligible || "—" },
    {
      key: "open", sortValue: (r) => r.outcomes.in_progress + r.outcomes.not_handed_over, sortFirst: "desc",
      header: "Masih jalan",
      mobileLabel: "Masih jalan",
      cell: (r) => r.outcomes.in_progress + r.outcomes.not_handed_over || "—",
    },
    {
      key: "rate", sortValue: (r) => r.approvalRate, sortFirst: "desc",
      header: "Disetujui dari yang diputus",
      mobileLabel: "Tingkat disetujui",
      cell: (r) => (r.approvalRate === null ? "—" : `${Math.round(r.approvalRate * 100)}%`),
    },
  ];

  return (
    <div data-slot="claim-analysis" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-6" /> Analisa Klaim
          </span>
        }
        description="Brand dan jenis barang yang paling sering masuk klaim garansi, beserta hasilnya. Dihitung dari brand dan kategori katalog Accurate yang dipilih saat tiket dibuat."
      />

      <FilterBar action="/rma/analisa">
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Dari" htmlFor="an-from" className="md:w-44">
            <Input id="an-from" type="date" name="from" defaultValue={params.from ?? ""} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Sampai" htmlFor="an-to" className="md:w-44">
            <Input id="an-to" type="date" name="to" defaultValue={params.to ?? ""} className="bg-card" />
          </FilterBarField>
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          <Button type="submit">Terapkan</Button>
          {isFiltered && (
            <Link href="/rma/analisa" className={buttonVariants({ variant: "ghost" })}>
              Semua waktu
            </Link>
          )}
        </div>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total klaim" value={a.total} />
        <StatCard label="Brand terbanyak" value={a.byBrand.find((r) => r.key !== UNKNOWN_KEY)?.label ?? "—"} />
        <StatCard label="Jenis terbanyak" value={a.byCategory.find((r) => r.key !== UNKNOWN_KEY)?.label ?? "—"} />
        <StatCard label="Brand tidak diketahui" value={a.unknownBrand} />
      </div>

      {a.unknownBrand > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {a.unknownBrand} dari {a.total} klaim belum punya brand: unitnya diketik manual, atau dibuat sebelum brand
            disimpan. Pilih unit dari katalog Accurate saat membuat tiket supaya klaim ikut terhitung di sini.
          </span>
        </p>
      )}

      {a.total === 0 ? (
        <EmptyState icon={BarChart3} title="Belum ada klaim di periode ini." />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Per brand</h2>
            <DataTable caption="Klaim per brand" sort={urlSort("/rma/analisa", params, "sort_brand")} columns={columns("Brand")} rows={a.byBrand} getRowKey={(r) => r.key} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Per jenis barang</h2>
            <DataTable caption="Klaim per jenis barang" sort={urlSort("/rma/analisa", params, "sort_category")} columns={columns("Jenis")} rows={a.byCategory} getRowKey={(r) => r.key} />
          </section>
          {a.byItem.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Barang paling sering diklaim</h2>
              <DataTable caption="Barang paling sering diklaim" sort={urlSort("/rma/analisa", params, "sort_item")} columns={columns("Barang")} rows={a.byItem} getRowKey={(r) => r.key} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
