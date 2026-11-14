import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import { scopedStoreIds, storeScopeFor } from "@/lib/store-scope-server";
import { CheckCircle2, Cpu, Download } from "lucide-react";
import { loadBuilds, type BuildRow } from "@/lib/stock-server";
import { BUILD_FILTERS, BUILD_STAGE_LABELS, buildMatches, isBuildFilter, type BuildFilter } from "@/lib/stock";
import { downloadHref } from "@/lib/download-name";
import { formatDateTime } from "@/lib/utils";
import { PhotoStrip } from "@/components/stok/PhotoStrip";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { parsePageSize } from "@/lib/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Rakitan PC — HNS IT Center" };

type Search = { filter?: string; store?: string; page?: string; per?: string; q?: string };
const PAGE_SIZE = 25;

const FILTER_LABELS: Record<BuildFilter, string> = { ...BUILD_STAGE_LABELS, all: "Semua" };

/**
 * Every PC build in every store, read only: where it is, what the quotation
 * holds, who ticked it at intake, and the photos. A row opens the ticket.
 */
export default async function BuildListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePage("page_stock_builds");
  const params = await searchParams;
  const filter = isBuildFilter(params.filter) ? params.filter : "all";
  // A kepala toko sees the stores they hold; everyone else every store.
  const scope = await storeScopeFor(session);
  const stores = scope.stores;
  const store = stores.find((s) => s.id === params.store);
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const loaded = await loadBuilds(scopedStoreIds(scope, store?.id), Date.now());
  const query = (params.q ?? "").trim();
  const all = query ? loaded.filter((r) => buildMatches(r, query)) : loaded;
  const filtered = filter === "all" ? all : all.filter((r) => r.stage === filter);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(params.page || "1") || 1));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const href = (f: BuildFilter, over: { page?: number; per?: number } = {}) => {
    const q = new URLSearchParams();
    if (f !== "all") q.set("filter", f);
    if (store) q.set("store", store.id);
    if (query) q.set("q", query);
    const per = over.per ?? pageSize;
    if (per !== PAGE_SIZE) q.set("per", String(per));
    if (over.page && over.page > 1) q.set("page", String(over.page));
    const s = q.toString();
    return `/stok/rakitan${s ? `?${s}` : ""}`;
  };

  const columns: DataTableColumn<BuildRow>[] = [
    { key: "photo", header: "Foto", interactive: true, cell: (r) => (r.photos.length ? <PhotoStrip size="sm" max={1} photos={r.photos} /> : <span className="text-xs text-muted-foreground">—</span>) },
    {
      key: "code", sortValue: (r) => r.code,
      header: "Kode",
      mobile: "title",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-mono whitespace-nowrap">{r.code}</span>
          {r.quoteCode && <span className="text-xs whitespace-nowrap text-muted-foreground">Quotation {r.quoteCode}</span>}
        </span>
      ),
    },
    {
      key: "accurate",
      header: "Foto untuk Accurate",
      // A link of its own: on a phone it sits below the card's link, not inside it.
      mobile: "footer",
      interactive: true,
      cell: (r) =>
        r.finishedPhotos.length ? (
          <span className="flex flex-col gap-1.5">
            {r.finishedPhotos.map((p) => (
              <a
                key={p.url}
                href={downloadHref(p.url, p.fileName)}
                download
                className={buttonVariants({ variant: "outline", size: "sm", className: "justify-start whitespace-nowrap" })}
              >
                <Download aria-hidden /> {p.title === "Foto rakitan revisi" ? "Unduh revisi" : "Unduh rakitan jadi"}
              </a>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Belum ada foto rakitan jadi</span>
        ),
    },
    {
      key: "who", sortValue: (r) => r.customer,
      header: "Customer",
      cell: (r) => (
        <span className="flex min-w-40 max-w-xs flex-col">
          <span className="font-medium">{r.customer}</span>
          <span className="text-xs text-muted-foreground">{r.store ?? "—"}</span>
        </span>
      ),
    },
    {
      key: "team", sortValue: (r) => r.technician,
      header: "Teknisi / sales",
      mobileLabel: "Teknisi",
      cell: (r) => (
        <span className="flex flex-col text-sm">
          <span>{r.technician ?? "—"}</span>
          {r.sales && <span className="text-xs text-muted-foreground">Sales {r.sales}</span>}
        </span>
      ),
    },
    {
      key: "comp", sortValue: (r) => r.components, sortFirst: "desc",
      header: "Komponen",
      cell: (r) => (
        <span className="flex flex-col text-sm">
          <span className="tabular-nums">{r.components} item</span>
          {r.intakeCheck ? (
            <span className="flex items-center gap-1 text-xs text-tone-green-fg" title={formatDateTime(r.intakeCheck.at)}>
              <CheckCircle2 aria-hidden className="size-3.5" /> dicek saat masuk{r.intakeCheck.by ? ` · ${r.intakeCheck.by}` : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{r.quoteCode ? "belum dicentang saat masuk" : "tanpa quotation"}</span>
          )}
        </span>
      ),
    },
    {
      key: "status", sortValue: (r) => BUILD_FILTERS.indexOf(r.stage),
      header: "Status",
      mobile: "badge",
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <StatusBadge kind="ticket" status={r.status} hasTechnician={Boolean(r.technician)} size="sm" />
          <span className="text-xs whitespace-nowrap text-muted-foreground">{r.days} hari di status ini</span>
        </span>
      ),
    },
  ];

  return (
    <div data-slot="stock-builds" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Cpu aria-hidden className="size-6" /> Rakitan PC
          </span>
        }
        description="Semua rakitan PC di setiap toko. Hanya lihat. Foto rakitan jadi bisa diunduh untuk diunggah ke Accurate."
        actions={
          <FilterBar action="/stok/rakitan">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <FilterBarSearch label="Cari" placeholder="Kode tiket, kode quotation, atau customer…" defaultValue={query} />
            {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
            <FilterBarField label="Toko" htmlFor="br-store" className="md:w-48">
              <NativeSelect id="br-store" name="store" defaultValue={store?.id ?? ""}>
                <option value="">Semua toko</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
            <Button type="submit">Tampilkan</Button>
          </FilterBar>
        }
      />

      <FilterChips
        label="Tahap"
        active={filter}
        chips={BUILD_FILTERS.map((f) => ({
          key: f,
          label: `${FILTER_LABELS[f]} (${f === "all" ? all.length : all.filter((r) => r.stage === f).length})`,
          href: href(f),
        }))}
      />

      <DataTable
        caption="Rakitan PC"
        columns={columns}
        rows={filtered}
        window={[(page - 1) * pageSize, page * pageSize]}
        sort={urlSort("/stok/rakitan", params)}
        getRowKey={(r) => r.ticketId}
        rowHref={(r) => `/stok/tickets/${r.ticketId}`}
        empty={<EmptyState icon={Cpu} title={query ? `Tidak ada rakitan yang cocok dengan "${query}"` : "Tidak ada rakitan di sini"} />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(n) => href(filter, { page: n })} className="sm:justify-center" />}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {rows.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + rows.length} dari {filtered.length} rakitan
          </p>
          <PageSizePicker value={pageSize} totalItems={filtered.length} hrefForSize={(n) => href(filter, { per: n })} />
        </div>
      </div>
    </div>
  );
}
