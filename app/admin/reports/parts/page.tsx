import Link from "next/link";
import type { ServicePart } from "@prisma/client";
import { Download, Package, TrendingUp, PackageX, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { TONE_CLASSES } from "@/lib/status-display";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { servicePartLabel } from "@/lib/service-parts";
import { monthLabel, summarizeParts } from "@/lib/reports/parts";
import { loadPartRows, loadPartRowsBetween, resolveReportMonth } from "@/lib/reports/parts-data";
import {
  DEMAND_MONTHS,
  STOCK_HINT_MIN_USES,
  demandWindow,
  outsideCatalog,
  rankCatalogDemand,
  worthStocking,
  type DemandRow,
  type OutsideRow,
} from "@/lib/reports/part-demand";
import { CatalogUnavailableError, getCatalogItem, isCatalogConfigured } from "@/lib/catalog/hns-data";
import { stockAtStore, type StoreRef } from "@/lib/catalog/items";

export const metadata = { title: "Laporan Pergantian Part — HNS IT Center" };

/** Detail rows shown on screen; the CSV export always carries all of them. */
const DETAIL_LIMIT = 300;
/** Items whose stock is looked up in the catalogue — one API call each. */
const DEMAND_LIMIT = 15;

type StockNow = { here: number | null; total: number };

/**
 * What the catalogue holds now for the most-used items. One lookup each, in
 * parallel; a lookup that fails shows as unknown rather than failing the page.
 */
async function stockFor(rows: DemandRow[], store: StoreRef | null): Promise<{ stock: Map<string, StockNow>; unavailable: boolean }> {
  const stock = new Map<string, StockNow>();
  if (!isCatalogConfigured()) return { stock, unavailable: true };
  let unavailable = false;
  await Promise.all(
    rows.map(async (r) => {
      if (!r.catalogItemId) return;
      try {
        const item = await getCatalogItem(r.catalogItemId);
        if (item) stock.set(r.sku, { here: stockAtStore(item, store), total: item.stockTotal });
      } catch (err) {
        if (!(err instanceof CatalogUnavailableError)) throw err;
        unavailable = true;
      }
    })
  );
  return { stock, unavailable };
}

export default async function PartsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;
  const month = resolveReportMonth(params.month);
  const storeId = params.store || null;

  const [stores, rows] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    loadPartRows(month, storeId),
  ]);
  const data = rows ?? [];
  const summary = summarizeParts(data);

  // What to stock: the last few months, not just the one on screen.
  const span = demandWindow(month)!;
  const demandRows = await loadPartRowsBetween(span.start, span.end, storeId);
  const demand = rankCatalogDemand(demandRows).slice(0, DEMAND_LIMIT);
  const outside = outsideCatalog(demandRows);
  const store = storeId ? (stores.find((s) => s.id === storeId) ?? null) : null;
  const storeName = store?.name ?? null;
  const { stock, unavailable: stockUnavailable } = await stockFor(demand, store);
  const windowLabel = `${monthLabel(span.firstMonth)} – ${monthLabel(month)}`;
  const exportHref = `/admin/reports/parts/export?month=${month}${storeId ? `&store=${storeId}` : ""}`;
  const catalogShare = summary.entries ? Math.round((summary.fromCatalog / summary.entries) * 100) : 0;

  const sectionTitle = "flex items-center gap-2 text-base font-semibold text-foreground";
  const muted = "text-sm text-muted-foreground";
  const emptyBox = "rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground";
  const ticketLink =
    "relative z-10 rounded-sm font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

  // On a phone the card title is truncated, so it carries the short SKU or
  // part kind; the item name, which runs long, is a full line underneath.
  const demandColumns: DataTableColumn<DemandRow>[] = [
    { key: "name", header: "Barang", className: "min-w-36 whitespace-normal", cell: (d) => <span className="font-semibold">{d.name}</span> },
    { key: "sku", header: "SKU", mobile: "title", className: "whitespace-nowrap", cell: (d) => d.sku },
    { key: "uses", header: "Dipakai", cell: (d) => <span className="font-bold">{d.uses}×</span> },
    { key: "quantity", header: "Unit", cell: (d) => d.quantity },
    { key: "months", header: "Bulan", cell: (d) => `${d.months}/${DEMAND_MONTHS}` },
    {
      key: "stock",
      header: "Stok sekarang",
      cell: (d) => {
        const s = stock.get(d.sku);
        if (!s) return <span className="text-muted-foreground">—</span>;
        if (!storeName) return s.total;
        return (
          <>
            {s.here ?? "—"} <span className="text-muted-foreground">(total {s.total})</span>
          </>
        );
      },
    },
    {
      key: "hint",
      header: <span className="sr-only">Saran</span>,
      mobileLabel: "Saran",
      mobile: "badge",
      cell: (d) => {
        const s = stock.get(d.sku);
        const decisive = s ? (storeName && s.here !== null ? s.here : s.total) : null;
        return (
          worthStocking(d, decisive) && (
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", TONE_CLASSES.amber)}>
              Pertimbangkan stok
            </span>
          )
        );
      },
    },
  ];

  const outsideColumns: DataTableColumn<OutsideRow>[] = [
    { key: "part", header: "Jenis", mobile: "title", cell: (o) => servicePartLabel(o.part as ServicePart) },
    { key: "name", header: "Nama yang diketik", className: "min-w-36 whitespace-normal", cell: (o) => <span className="font-semibold">{o.name}</span> },
    { key: "uses", header: "Dipakai", cell: (o) => <span className="font-bold">{o.uses}×</span> },
    { key: "quantity", header: "Unit", cell: (o) => o.quantity },
    {
      key: "tickets",
      header: "Tiket",
      cell: (o) => (
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {o.tickets.map((t) => (
            <Link key={t.id} href={`/admin/tickets/${t.id}`} className={ticketLink}>
              {t.code}
            </Link>
          ))}
        </div>
      ),
    },
  ];

  type PartGroup = (typeof summary.byPart)[number];
  const byPartColumns: DataTableColumn<PartGroup>[] = [
    { key: "part", header: "Jenis", mobile: "title", cell: (p) => servicePartLabel(p.part as ServicePart) },
    { key: "quantity", header: "Jumlah", cell: (p) => <span className="font-bold">{p.quantity}</span> },
    { key: "entries", header: "Catatan", cell: (p) => p.entries },
  ];

  type TechGroup = (typeof summary.byTechnician)[number];
  const byTechColumns: DataTableColumn<TechGroup>[] = [
    { key: "name", header: "Teknisi", mobile: "title", cell: (t) => t.name },
    { key: "quantity", header: "Jumlah", cell: (t) => <span className="font-bold">{t.quantity}</span> },
    { key: "entries", header: "Catatan", cell: (t) => t.entries },
  ];

  type ItemGroup = (typeof summary.byItem)[number];
  const byItemColumns: DataTableColumn<ItemGroup>[] = [
    { key: "label", header: "Barang", className: "min-w-36 whitespace-normal", cell: (i) => <span className="font-semibold">{i.label}</span> },
    { key: "sku", header: "SKU", mobile: "title", className: "whitespace-nowrap", cell: (i) => i.sku ?? <span className="text-muted-foreground">manual</span> },
    { key: "category", header: "Kategori Accurate", cell: (i) => i.category ?? "—" },
    { key: "quantity", header: "Jumlah", cell: (i) => <span className="font-bold">{i.quantity}</span> },
    { key: "tickets", header: "Tiket", cell: (i) => i.tickets },
  ];

  type DetailRow = (typeof data)[number];
  const detailColumns: DataTableColumn<DetailRow>[] = [
    { key: "ticket", header: "Tiket", mobile: "title", cell: (r) => <span className="font-semibold whitespace-nowrap text-primary">{r.ticketCode}</span> },
    { key: "date", header: "Tanggal", className: "whitespace-nowrap", cell: (r) => <span className="text-[0.8125rem]">{formatDateTime(r.createdAt)}</span> },
    { key: "store", header: "Toko", className: "whitespace-normal", cell: (r) => r.storeName ?? "—" },
    { key: "technician", header: "Teknisi", className: "whitespace-normal", cell: (r) => r.technicianName },
    { key: "part", header: "Jenis", cell: (r) => servicePartLabel(r.part as ServicePart) },
    { key: "item", header: "Barang", className: "min-w-36 whitespace-normal", cell: (r) => r.itemName ?? "—" },
    { key: "sku", header: "SKU", className: "whitespace-nowrap", cell: (r) => r.sku ?? "—" },
    { key: "quantity", header: "Jml", mobile: "badge", cell: (r) => <span className="font-bold">{r.quantity}</span> },
  ];

  return (
    <div data-slot="parts-report" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Package aria-hidden="true" className="size-6" /> Laporan Pergantian Part
          </span>
        }
        description={
          <>
            Part yang dicatat teknisi di tiket service. Barang diambil dari katalog Accurate
            (data.hnsitcenter.id); laporan ini tidak mengubah stok di Accurate.
          </>
        }
        actions={
          <a href={exportHref} className={buttonVariants({ variant: "outline", className: "bg-card" })}>
            <Download aria-hidden="true" /> Ekspor CSV
          </a>
        }
      />

      <FilterBar action="/admin/reports/parts">
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Bulan" htmlFor="parts-month">
            <Input id="parts-month" type="month" name="month" defaultValue={month} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Toko" htmlFor="parts-store">
            <NativeSelect id="parts-store" name="store" defaultValue={storeId ?? ""}>
              <option value="">Semua toko</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </NativeSelect>
          </FilterBarField>
        </div>
        <Button type="submit">Tampilkan</Button>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={summary.quantity} label="Total part dipasang" />
        <StatCard value={summary.entries} label="Catatan" />
        <StatCard value={summary.tickets} label="Tiket" />
        <StatCard value={`${catalogShare}%`} label={`Dari katalog (${summary.fromCatalog}/${summary.entries})`} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className={sectionTitle}>
            <TrendingUp aria-hidden="true" className="size-[18px]" /> Sering dipakai — {windowLabel}
          </h2>
          <p className={muted}>
            Barang dari katalog Accurate yang paling sering dipasang dalam {DEMAND_MONTHS} bulan terakhir
            {storeName ? ` di ${storeName}` : ""}, dengan stok sekarang. Dipakai minimal {STOCK_HINT_MIN_USES}× dan
            stoknya kosong ditandai — bahan pertimbangan untuk distok, bukan pesanan otomatis.
          </p>
          {stockUnavailable && (
            <p className="flex items-center gap-1.5 text-xs text-tone-amber-fg">
              <AlertTriangle aria-hidden="true" className="size-3" /> Stok sebagian barang tidak bisa diambil dari katalog saat ini.
            </p>
          )}
        </div>
        <DataTable
          caption="Barang katalog yang sering dipakai"
          columns={demandColumns}
          rows={demand}
          getRowKey={(d) => d.sku}
          empty={<p className={emptyBox}>Belum ada part dari katalog yang dipasang pada periode ini.</p>}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className={sectionTitle}>
            <PackageX aria-hidden="true" className="size-[18px]" /> Di luar katalog Accurate — {windowLabel}
          </h2>
          <p className={muted}>
            Part yang diketik manual karena tidak ada di katalog, atau barangnya belum diterima di Accurate. Begitu
            kodenya ada, masukkan lewat &ldquo;Masukkan kode&rdquo; di Rincian Biaya tiketnya dan part itu keluar dari
            daftar ini. Yang sering muncul tanpa kode layak ditambahkan ke Accurate.
          </p>
        </div>
        <DataTable
          caption="Part di luar katalog Accurate"
          columns={outsideColumns}
          rows={outside}
          getRowKey={(o) => `${o.part}:${o.name}`}
          empty={<p className={emptyBox}>Semua part pada periode ini dipilih dari katalog.</p>}
        />
      </section>

      {data.length === 0 ? (
        <p className={cn(emptyBox, "p-6 text-center")}>Belum ada part yang dicatat pada periode ini.</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-3">
              <h2 className={sectionTitle}>Per jenis part</h2>
              <DataTable caption="Per jenis part" columns={byPartColumns} rows={summary.byPart} getRowKey={(p) => p.part} />
            </section>
            <section className="flex min-w-0 flex-col gap-3">
              <h2 className={sectionTitle}>Per teknisi</h2>
              <DataTable caption="Per teknisi" columns={byTechColumns} rows={summary.byTechnician} getRowKey={(t) => t.name} />
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className={sectionTitle}>Per barang</h2>
            <DataTable caption="Per barang" columns={byItemColumns} rows={summary.byItem} getRowKey={(i) => i.key} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className={sectionTitle}>Rincian</h2>
            <DataTable
              caption="Rincian part yang dicatat"
              columns={detailColumns}
              rows={data.slice(0, DETAIL_LIMIT)}
              getRowKey={(r) => r.id}
              rowHref={(r) => `/admin/tickets/${r.ticketId}`}
            />
            {data.length > DETAIL_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Menampilkan {DETAIL_LIMIT} dari {data.length} catatan. Ekspor CSV untuk semuanya.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
