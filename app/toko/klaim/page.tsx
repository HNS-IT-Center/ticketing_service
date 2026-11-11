import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { CLAIM_STATUS_FILTERS, claimListOrderBy, claimListWhere } from "@/lib/rma/claim-list";
import { analyzeClaims, claimOutcome } from "@/lib/rma/claim-analysis";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { ticketStatusDisplay } from "@/lib/status-display";
import { ticketPartyName } from "@/lib/ticket-party";
import { parsePageSize } from "@/lib/pagination";
import { NoStores } from "@/components/toko/Sections";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Klaim Garansi Toko — HNS IT Center" };
const PAGE_SIZE = 10;

type Search = { status?: string; q?: string; page?: string; sort?: string; per?: string; store?: string };

/**
 * The kepala toko's warranty claims: the same list the RMA desk keeps — claims
 * that reached the desk, plus those still with a technician — for their own
 * stores, each with its RMA stage. Read only; a row opens the ticket.
 */
export default async function StoreClaimsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer();
  if (stores.length === 0) return <NoStores title="Klaim Garansi" />;
  const params = await searchParams;
  const { chosen, shown, ids } = pickStores(stores, params.store);

  const status = params.status || "all";
  const query = params.q || "";
  const sort = params.sort || "updated_desc";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const inStores = { store_location_id: { in: ids } };
  const where = { AND: [inStores, claimListWhere(status, query)] };
  const [claims, total, all] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: claimListOrderBy(sort),
      take: pageSize,
      skip,
      include: {
        user: { select: { name: true } },
        technician: { select: { name: true } },
        rma_case: { select: { rma_code: true, status: true, decision: true, vendor_name: true } },
      },
    }),
    db.ticket.count({ where }),
    // The four numbers on top cover every claim of the store, whatever the filter.
    db.ticket.findMany({
      where: { AND: [inStores, claimListWhere("all", "")] },
      select: { device_brand: true, device_catalog_category: true, device_sku: true, device_name: true, rma_case: { select: { status: true, decision: true } } },
    }),
  ]);
  const pages = Math.ceil(total / pageSize);
  const outcomes = all.map((c) => claimOutcome(c.rma_case));
  const count = (...o: ReturnType<typeof claimOutcome>[]) => outcomes.filter((x) => o.includes(x)).length;
  const topBrand = analyzeClaims(all).byBrand.find((b) => b.key !== "__unknown__");

  const href = (over: Partial<Record<keyof Search, string | number | undefined>> = {}) => {
    const merged: Record<string, string | number | undefined> = {
      status: status !== "all" ? status : undefined,
      q: query || undefined,
      sort: sort !== "updated_desc" ? sort : undefined,
      per: pageSize !== PAGE_SIZE ? pageSize : undefined,
      store: chosen?.id,
      ...over,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) qs.set(k, String(v));
    const s = qs.toString();
    return `/toko/klaim${s ? `?${s}` : ""}`;
  };

  type Row = (typeof claims)[number];
  const columns: DataTableColumn<Row>[] = [
    { key: "code", header: "Kode", mobile: "title", cell: (t) => <span className="font-mono whitespace-nowrap">{t.ticket_code}</span> },
    {
      key: "rma",
      header: "RMA",
      cell: (t) =>
        t.rma_case ? (
          <span className="flex flex-col">
            <span className="font-mono text-[0.8125rem] whitespace-nowrap text-primary">{t.rma_case.rma_code}</span>
            {t.rma_case.vendor_name && <span className="text-[0.7rem] text-muted-foreground">{t.rma_case.vendor_name}</span>}
          </span>
        ) : (
          <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground">belum diserahkan</span>
        ),
    },
    {
      key: "unit",
      header: "Customer / unit",
      cell: (t) => (
        <span className="flex min-w-0 max-w-md flex-col">
          <span className="font-medium">{ticketPartyName(t)}</span>
          <span className="line-clamp-2 text-[0.7rem] text-muted-foreground">
            {t.device_brand ? `${t.device_brand} · ` : ""}
            {t.device_name?.trim() || t.device_type.replace(/_/g, " ")}
          </span>
          {t.device_sn?.trim() && (
            <span className="text-[0.7rem] text-muted-foreground">
              SN <span className="font-mono font-medium text-foreground">{t.device_sn.trim()}</span>
            </span>
          )}
        </span>
      ),
    },
    { key: "tech", header: "Teknisi", className: "text-muted-foreground", cell: (t) => t.technician?.name ?? "—" },
    {
      key: "status",
      header: "Tahap",
      mobile: "badge",
      cell: (t) => <StatusBadge {...ticketBadgeChoice(t.status, t.rma_case?.status)} hasTechnician={Boolean(t.technician_id)} size="sm" />,
    },
    { key: "updated", header: "Update", className: "whitespace-nowrap text-muted-foreground", cell: (t) => t.updated_at.toLocaleDateString("id-ID") },
  ];

  const chips = CLAIM_STATUS_FILTERS.map((s) => ({
    key: s,
    label: s === "all" ? "Semua" : ticketStatusDisplay(s).label,
    href: href({ status: s === "all" ? undefined : s, page: undefined }),
  }));

  return (
    <div data-slot="store-claims" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-6" /> Klaim Garansi
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${total} klaim`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Masih berjalan" value={count("in_progress", "not_handed_over")} />
        <StatCard label="Disetujui vendor" value={count("approved")} tone="success" />
        <StatCard label="Ditolak / tidak layak" value={count("vendor_rejected", "ineligible")} tone={count("vendor_rejected", "ineligible") ? "warning" : "default"} />
        <StatCard label="Brand terbanyak" value={topBrand ? topBrand.label : "—"} hint={topBrand ? `${topBrand.total} klaim` : "brand belum tercatat"} />
      </div>

      <div className="flex flex-col gap-3">
        <FilterBar action="/toko/klaim">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <FilterBarSearch label="Cari klaim" placeholder="Cari kode, RMA, customer, unit, SN, atau vendor…" defaultValue={query} />
          {stores.length > 1 && (
            <FilterBarField label="Toko" htmlFor="tk-store" className="md:w-44">
              <NativeSelect id="tk-store" name="store" defaultValue={chosen?.id ?? ""}>
                <option value="">Semua toko</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
          )}
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Cari</Button>
            {query && (
              <Link href={href({ q: undefined, page: undefined })} className={buttonVariants({ variant: "ghost" })}>
                Hapus
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips label="Status" chips={chips} active={status} />
      </div>

      <DataTable
        caption="Klaim garansi toko"
        columns={columns}
        rows={claims}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/toko/tickets/${t.id}`}
        empty={<EmptyState icon={ShieldCheck} title="Tidak ada klaim yang cocok" />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(p) => href({ page: p })} className="sm:justify-center" />}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {claims.length ? skip + 1 : 0}–{Math.min(skip + claims.length, total)} dari {total} klaim
          </p>
          <PageSizePicker value={pageSize} totalItems={total} hrefForSize={(n) => href({ per: n === PAGE_SIZE ? undefined : n, page: undefined })} />
        </div>
      </div>
    </div>
  );
}
