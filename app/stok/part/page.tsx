import Link from "next/link";
import { Download, PackageSearch } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/store-dashboard";
import { loadOutgoingParts, type OutgoingRow } from "@/lib/stock-server";
import { OUTGOING_KINDS, OUTGOING_KIND_LABELS } from "@/lib/stock";
import { outgoingQuery, readOutgoingSearch, type OutgoingSearch } from "@/lib/stock-filter";
import { parsePageSize } from "@/lib/pagination";
import { formatDateTime } from "@/lib/utils";
import { PhotoStrip } from "@/components/stok/PhotoStrip";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { StatCard } from "@/components/app/StatCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Part Keluar — HNS IT Center" };
const PAGE_SIZE = 25;

/**
 * Every part that went out on a ticket, all stores: replaced parts on service
 * tickets (with their photos), items fitted on upgrades, and the components
 * of PC builds (with the build's photos). Read only.
 */
export default async function OutgoingPartsPage({ searchParams }: { searchParams: Promise<OutgoingSearch> }) {
  await requireRole("StockAdmin", "Administrator");
  const raw = await searchParams;
  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const p = readOutgoingSearch(raw, stores.map((s) => s.id), Date.now());
  const rows = await loadOutgoingParts({ start: p.period.start, end: p.period.end, storeId: p.storeId, kind: p.kind, q: p.q, uncoded: p.uncoded });

  const pageSize = parsePageSize(raw.per, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(raw.page || "1") || 1));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const units = rows.reduce((n, r) => n + r.quantity, 0);
  const uncoded = rows.filter((r) => !r.sku).length;
  const withPhotos = rows.filter((r) => r.photos.length > 0).length;

  const href = (over: Record<string, string | undefined> = {}) => {
    const q = outgoingQuery(p, { per: pageSize !== PAGE_SIZE ? String(pageSize) : undefined, ...over });
    return `/stok/part${q ? `?${q}` : ""}`;
  };

  const columns: DataTableColumn<OutgoingRow>[] = [
    { key: "photo", header: "Foto", interactive: true, cell: (r) => (r.photos.length ? <PhotoStrip size="sm" max={1} photos={r.photos} /> : <span className="text-xs text-muted-foreground">—</span>) },
    {
      key: "item",
      header: "Barang",
      mobile: "title",
      cell: (r) => (
        <span className="flex min-w-56 max-w-md flex-col">
          <span title={r.name} className="line-clamp-2 font-medium">
            {r.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {r.category}
            {r.quantity > 1 ? ` · ${r.quantity} unit` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "sku",
      header: "Kode Accurate",
      mobile: "badge",
      cell: (r) =>
        r.sku ? (
          <span className="font-mono text-sm whitespace-nowrap">{r.sku}</span>
        ) : (
          <span className="rounded-full border border-tone-amber-border bg-tone-amber-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-tone-amber-fg">
            tanpa kode
          </span>
        ),
    },
    {
      key: "ticket",
      header: "Tiket / tanggal",
      mobileLabel: "Tiket",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-mono whitespace-nowrap">{r.code}</span>
          <span className="text-xs text-muted-foreground">{OUTGOING_KIND_LABELS[r.kind]}</span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(r.at)}</span>
        </span>
      ),
    },
    {
      key: "where",
      header: "Toko / teknisi",
      mobileLabel: "Toko",
      cell: (r) => (
        <span className="flex flex-col text-sm">
          <span>{r.store ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{r.technician ?? "—"}</span>
        </span>
      ),
    },
  ];

  return (
    <div data-slot="stock-parts" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <PackageSearch aria-hidden className="size-6" /> Part Keluar
          </span>
        }
        description={`Part ganti, barang upgrade, dan komponen rakitan · ${p.period.label}`}
        actions={
          <a href={`/stok/part/export${(() => { const q = outgoingQuery(p); return q ? `?${q}` : ""; })()}`} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden /> Export Excel
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Baris" value={rows.length} />
        <StatCard label="Jumlah unit" value={units} />
        <StatCard label="Tanpa kode Accurate" value={uncoded} tone={uncoded ? "warning" : "default"} />
        <StatCard label="Ada fotonya" value={withPhotos} hint={rows.length ? `${Math.round((withPhotos / rows.length) * 100)}% dari baris` : undefined} />
      </div>

      <div className="flex flex-col gap-3">
        <FilterChips
          label="Periode"
          active={p.period.preset}
          chips={PERIOD_PRESETS.filter((x) => x !== "range").map((x) => ({ key: x, label: PERIOD_LABELS[x], href: href({ period: x, page: undefined }) }))}
        />
        <FilterBar action="/stok/part">
          <input type="hidden" name="period" value="range" />
          {p.kind && <input type="hidden" name="kind" value={p.kind} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Cari" placeholder="Nama barang, kode Accurate, atau kode tiket…" defaultValue={p.q} />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterBarField label="Dari" htmlFor="op-from" className="md:w-40">
              <Input id="op-from" type="date" name="from" defaultValue={p.period.fromDay} className="bg-card" />
            </FilterBarField>
            <FilterBarField label="Sampai" htmlFor="op-to" className="md:w-40">
              <Input id="op-to" type="date" name="to" defaultValue={p.period.toDay} className="bg-card" />
            </FilterBarField>
          </div>
          <FilterBarField label="Toko" htmlFor="op-store" className="md:w-44">
            <NativeSelect id="op-store" name="store" defaultValue={p.storeId ?? ""}>
              <option value="">Semua toko</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-9">
            <input type="checkbox" name="uncoded" value="1" defaultChecked={p.uncoded} className="size-4 accent-primary" />
            Tanpa kode saja
          </label>
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Terapkan</Button>
            {(p.q || p.uncoded || p.storeId) && (
              <Link href={href({ q: undefined, uncoded: undefined, store: undefined, page: undefined })} className={buttonVariants({ variant: "ghost" })}>
                Hapus
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips
          label="Jenis"
          active={p.kind ?? "all"}
          chips={[
            { key: "all", label: "Semua", href: href({ kind: undefined, page: undefined }) },
            ...OUTGOING_KINDS.map((k) => ({ key: k, label: OUTGOING_KIND_LABELS[k], href: href({ kind: k, page: undefined }) })),
          ]}
        />
      </div>

      <DataTable
        caption="Part keluar"
        columns={columns}
        rows={shown}
        getRowKey={(r) => r.key}
        rowHref={(r) => `/stok/tickets/${r.ticketId}`}
        empty={<EmptyState icon={PackageSearch} title="Tidak ada part keluar yang cocok" />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(n) => href({ page: n > 1 ? String(n) : undefined })} className="sm:justify-center" />}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {shown.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + shown.length} dari {rows.length} baris
          </p>
          <PageSizePicker value={pageSize} totalItems={rows.length} hrefForSize={(n) => href({ per: n === PAGE_SIZE ? undefined : String(n), page: undefined })} />
        </div>
      </div>
    </div>
  );
}
