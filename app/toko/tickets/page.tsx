import Link from "next/link";
import { FileSpreadsheet, Ticket } from "lucide-react";
import { db } from "@/lib/db";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { STORE_TICKET_TYPES, storeTicketWhere } from "@/lib/store-ticket-list";
import { ADMIN_TICKET_FILTERS, DEFAULT_TICKET_SORT, ticketListOrderBy } from "@/lib/ticket-list-filter";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { relativeTimeId } from "@/lib/ticket-recency";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { ticketPartyName } from "@/lib/ticket-party";
import { parsePageSize } from "@/lib/pagination";
import RecencyCode from "@/components/tickets/RecencyCode";
import { NoStores } from "@/components/toko/Sections";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Tiket Toko — HNS IT Center" };
const PAGE_SIZE = 10;

type Search = { status?: string; q?: string; page?: string; sort?: string; per?: string; tech?: string; type?: string; store?: string };

/** Every ticket of the kepala toko's stores, read only: search, filter, open, export. */
export default async function StoreTicketsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer();
  if (stores.length === 0) return <NoStores title="Tiket Toko" />;
  const params = await searchParams;
  const { chosen, shown, ids } = pickStores(stores, params.store);

  const status = params.status || "all";
  const query = params.q || "";
  const sort = params.sort || DEFAULT_TICKET_SORT;
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const now = new Date();

  const technicians = await db.user.findMany({
    where: { role: "Technician", store_assignments: { some: { store_id: { in: ids } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const tech = technicians.some((t) => t.id === params.tech) ? params.tech : undefined;
  const type = (STORE_TICKET_TYPES as string[]).includes(params.type ?? "") ? params.type : undefined;
  const where = storeTicketWhere({ storeIds: ids, status, query, technicianId: tech, type });

  const [tickets, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: ticketListOrderBy(sort),
      take: pageSize,
      skip,
      include: {
        user: { select: { name: true } },
        technician: { select: { name: true } },
        store_location: { select: { code: true } },
        rma_case: { select: { status: true } },
        status_logs: { orderBy: { created_at: "desc" }, take: 1, select: { created_at: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);
  const pages = Math.ceil(total / pageSize);

  const query_ = (over: Partial<Record<keyof Search, string | number | undefined>>) => {
    const merged: Record<string, string | number | undefined> = {
      status: status !== "all" ? status : undefined,
      q: query || undefined,
      sort: sort !== DEFAULT_TICKET_SORT ? sort : undefined,
      per: pageSize !== PAGE_SIZE ? pageSize : undefined,
      tech,
      type,
      store: chosen?.id,
      ...over,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) qs.set(k, String(v));
    return qs.toString();
  };
  const href = (over: Parameters<typeof query_>[0] = {}) => {
    const s = query_(over);
    return `/toko/tickets${s ? `?${s}` : ""}`;
  };

  const sortHeader = (label: string, asc: string, desc: string) => {
    const active = sort === asc || sort === desc;
    const next = sort === asc ? desc : asc;
    return (
      <Link href={href({ sort: next, page: undefined })} className="inline-flex items-center gap-1 rounded-sm text-inherit outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        {label}
        {active ? (sort === asc ? " ↑" : " ↓") : <span className="opacity-30"> ↕</span>}
      </Link>
    );
  };

  type Row = (typeof tickets)[number];
  const columns: DataTableColumn<Row>[] = [
    { key: "code", header: sortHeader("Kode", "code_asc", "code_desc"), mobileLabel: "Kode", mobile: "title", cell: (t) => <RecencyCode ticket={t} now={now} /> },
    { key: "type", header: "Jenis", cell: (t) => TICKET_TYPE_LABELS[t.ticket_type], className: "hidden whitespace-nowrap xl:table-cell" },
    {
      key: "unit",
      header: "Customer / unit",
      cell: (t) => (
        <span className="flex min-w-0 max-w-md flex-col">
          <span className="font-medium">{ticketPartyName(t)}</span>
          {/* Catalogue names run to ~120 characters; two lines, the rest in the tooltip. */}
          {t.device_name && <span title={t.device_name} className="line-clamp-2 text-xs text-muted-foreground">{t.device_name}</span>}
        </span>
      ),
    },
    {
      key: "technician",
      header: "Teknisi",
      cell: (t) => t.technician?.name ?? <span className="text-sm font-medium text-destructive">Belum ada</span>,
      className: "whitespace-nowrap text-muted-foreground",
    },
    {
      key: "status",
      header: sortHeader("Status", "status_asc", "status_desc"),
      mobileLabel: "Status",
      mobile: "badge",
      cell: (t) => <StatusBadge {...ticketBadgeChoice(t.status, t.rma_case?.status)} hasTechnician={Boolean(t.technician_id)} size="sm" />,
    },
    {
      key: "date",
      header: sortHeader("Update terakhir", "updated_asc", "updated_desc"),
      mobileLabel: "Update terakhir",
      className: "whitespace-nowrap text-muted-foreground",
      cell: (t) => {
        const last = t.status_logs[0]?.created_at ?? t.updated_at;
        return (
          <span className="flex flex-col whitespace-nowrap">
            <span>{relativeTimeId(last > t.updated_at ? last : t.updated_at, now)}</span>
            <span className="text-[0.7rem]">dibuat {t.created_at.toLocaleDateString("id-ID")}</span>
          </span>
        );
      },
    },
  ];

  const exportQs = query_({ page: undefined, per: undefined });
  const chips = ADMIN_TICKET_FILTERS.map(({ key, label }) => ({
    key,
    label,
    href: href({ status: key === "all" ? undefined : key, page: undefined }),
  }));

  return (
    <div data-slot="store-tickets" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Ticket aria-hidden className="size-6" /> Tiket Toko
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${total} tiket`}
        actions={
          <a
            href={`/toko/tickets/export${exportQs ? `?${exportQs}` : ""}`}
            download
            className={buttonVariants({ variant: "outline" })}
            title="Semua tiket yang cocok dengan filter ini, bukan hanya halaman ini"
          >
            <FileSpreadsheet aria-hidden /> Export Excel
          </a>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/toko/tickets">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {sort !== DEFAULT_TICKET_SORT && <input type="hidden" name="sort" value={sort} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Cari tiket" placeholder="Cari kode, customer, atau nama barang…" defaultValue={query} />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterBarField label="Teknisi" htmlFor="tt-tech" className="md:w-44">
              <NativeSelect id="tt-tech" name="tech" defaultValue={tech ?? ""}>
                <option value="">Semua teknisi</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
            <FilterBarField label="Jenis" htmlFor="tt-type" className="md:w-40">
              <NativeSelect id="tt-type" name="type" defaultValue={type ?? ""}>
                <option value="">Semua jenis</option>
                {STORE_TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TICKET_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
          </div>
          {stores.length > 1 && (
            <FilterBarField label="Toko" htmlFor="tt-store" className="md:w-44">
              <NativeSelect id="tt-store" name="store" defaultValue={chosen?.id ?? ""}>
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
            {(query || tech || type) && (
              <Link href={href({ q: undefined, tech: undefined, type: undefined, page: undefined })} className={buttonVariants({ variant: "ghost" })}>
                Hapus filter
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips label="Status" chips={chips} active={status} />
      </div>

      <DataTable
        caption="Tiket Toko"
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/toko/tickets/${t.id}`}
        empty={<EmptyState icon={Ticket} title="Tidak ada tiket yang cocok" />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && (
          <Pagination page={page} pageCount={pages} hrefForPage={(p) => href({ page: p })} className="sm:justify-center" />
        )}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {tickets.length ? skip + 1 : 0}–{Math.min(skip + tickets.length, total)} dari {total} tiket
          </p>
          <PageSizePicker value={pageSize} totalItems={total} hrefForSize={(n) => href({ per: n === PAGE_SIZE ? undefined : n, page: undefined })} />
        </div>
      </div>
    </div>
  );
}
