import Link from "next/link";
import { MessageCircle, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/page-access";
import { scopedStoreIds, storeScopeFor } from "@/lib/store-scope-server";
import { CUSTOMER_TICKET_TYPES, filterCustomers, groupCustomers, isCustomerTicketType, type Customer } from "@/lib/customers";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { parsePageSize } from "@/lib/pagination";
import { waLink } from "@/lib/whatsapp";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { AutoSubmitSelect } from "@/components/app/AutoSubmitSelect";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Data Customer — HNS IT Center" };
const PAGE_SIZE = 25;

type Search = { q?: string; jenis?: string; store?: string; urut?: string; page?: string; per?: string };

const SORTS = {
  terbaru: { label: "Terakhir datang", by: (a: Customer, b: Customer) => b.lastVisit.getTime() - a.lastVisit.getTime() },
  terbanyak: { label: "Tiket terbanyak", by: (a: Customer, b: Customer) => b.tickets - a.tickets || b.lastVisit.getTime() - a.lastVisit.getTime() },
  nama: { label: "Nama A–Z", by: (a: Customer, b: Customer) => a.name.localeCompare(b.name, "id") },
} as const;
type SortKey = keyof typeof SORTS;

const day = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/**
 * Data Customer (owner, 2026-11-19): who brings units in, their number, and
 * what they came for. Built from the tickets — customers have no account —
 * one row per phone number (lib/customers.ts). Whoever may see every ticket
 * sees every customer; a kepala toko those of the stores they hold.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePage("page_tickets_all", "page_toko_tickets");
  const scope = await storeScopeFor(session);
  const params = await searchParams;

  const storeIds = scopedStoreIds(scope, params.store);
  const chosenStore = scope.stores.find((s) => s.id === params.store) ?? null;
  const type = isCustomerTicketType(params.jenis) ? params.jenis : null;
  const sort: SortKey = params.urut && params.urut in SORTS ? (params.urut as SortKey) : "terbaru";
  const query = params.q ?? "";
  const pageSize = parsePageSize(params.per, PAGE_SIZE);

  const tickets = await db.ticket.findMany({
    where: storeIds ? { store_location_id: { in: storeIds } } : {},
    select: {
      ticket_type: true,
      created_at: true,
      is_for_self: true,
      customer_name: true,
      customer_phone: true,
      customer_email: true,
      user: { select: { name: true, role: true, phone_number: true, email: true } },
      store_location: { select: { name: true } },
    },
  });
  const all = groupCustomers(tickets.map(({ store_location, ...t }) => ({ ...t, store: store_location?.name ?? null })));
  const shown = filterCustomers(all, query, type).sort(SORTS[sort].by);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const page = Math.min(Math.max(1, parseInt(params.page || "1") || 1), pages);
  const skip = (page - 1) * pageSize;
  const rows = shown.slice(skip, skip + pageSize);

  const href = (over: Partial<Record<keyof Search, string | number | undefined>> = {}) => {
    const merged: Record<string, string | number | undefined> = {
      q: query || undefined,
      jenis: type ?? undefined,
      store: chosenStore?.id,
      urut: sort !== "terbaru" ? sort : undefined,
      per: pageSize !== PAGE_SIZE ? pageSize : undefined,
      ...over,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) qs.set(k, String(v));
    const s = qs.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      mobile: "title",
      cell: (c) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{c.name}</span>
          {c.email && <span className="truncate text-[0.75rem] text-muted-foreground">{c.email}</span>}
        </span>
      ),
    },
    {
      key: "phone",
      header: "No. HP",
      interactive: true,
      cell: (c) => {
        const wa = waLink(c.phone, `Halo kak ${c.name}, `);
        if (!c.phone) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono whitespace-nowrap">{c.phone}</span>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp ${c.name}`}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-tone-green-border bg-tone-green-bg text-tone-green-fg hover:opacity-90"
              >
                <MessageCircle aria-hidden className="size-4" />
              </a>
            )}
          </span>
        );
      },
    },
    {
      key: "types",
      header: "Keperluan",
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.types.map((t) => (
            <span key={t.type} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap text-foreground">
              {t.label}
              {t.count > 1 && <span className="text-muted-foreground"> ×{t.count}</span>}
            </span>
          ))}
        </span>
      ),
    },
    { key: "tickets", header: "Tiket", mobile: "badge", className: "text-right tabular-nums", cell: (c) => `${c.tickets}×` },
    { key: "last", header: "Terakhir datang", className: "whitespace-nowrap text-muted-foreground", cell: (c) => day(c.lastVisit) },
    ...(scope.stores.length > 1
      ? [{ key: "store", header: "Toko", className: "text-muted-foreground", cell: (c: Customer) => c.stores.join(", ") || "—" } satisfies DataTableColumn<Customer>]
      : []),
  ];

  return (
    <div data-slot="customers" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Users aria-hidden className="size-6" /> Data Customer
          </span>
        }
        description={`${shown.length} customer${chosenStore ? ` · ${chosenStore.name}` : ""}. Dari data customer di setiap tiket; nama dan nomor HP yang sama dihitung satu customer.`}
      />

      <FilterBar action="/admin/customers">
        {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
        <FilterBarSearch label="Cari customer" placeholder="Cari nama, nomor HP, atau email…" defaultValue={query} />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Keperluan" htmlFor="cu-jenis" className="md:w-44">
            <AutoSubmitSelect id="cu-jenis" name="jenis" defaultValue={type ?? ""} key={`j-${type}`}>
              <option value="">Semua</option>
              {CUSTOMER_TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TICKET_TYPE_LABELS[t]}
                </option>
              ))}
            </AutoSubmitSelect>
          </FilterBarField>
          <FilterBarField label="Urutkan" htmlFor="cu-urut" className="md:w-44">
            <AutoSubmitSelect id="cu-urut" name="urut" defaultValue={sort === "terbaru" ? "" : sort} key={`u-${sort}`}>
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k === "terbaru" ? "" : k}>
                  {SORTS[k].label}
                </option>
              ))}
            </AutoSubmitSelect>
          </FilterBarField>
          {scope.stores.length > 1 && (
            <FilterBarField label="Toko" htmlFor="cu-store" className="col-span-2 md:w-44">
              <AutoSubmitSelect id="cu-store" name="store" defaultValue={chosenStore?.id ?? ""} key={`s-${chosenStore?.id ?? ""}`}>
                <option value="">Semua toko</option>
                {scope.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AutoSubmitSelect>
            </FilterBarField>
          )}
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          {query && (
            <Link href={href({ q: undefined, page: undefined })} className={buttonVariants({ variant: "ghost" })}>
              Hapus
            </Link>
          )}
        </div>
      </FilterBar>

      <DataTable
        caption="Data customer"
        columns={columns}
        rows={rows}
        getRowKey={(c) => c.key}
        empty={<EmptyState icon={Users} title={query || type ? "Tidak ada customer yang cocok" : "Belum ada data customer"} />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(p) => href({ page: p })} className="sm:justify-center" />}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {rows.length ? skip + 1 : 0}–{skip + rows.length} dari {shown.length} customer
          </p>
          <PageSizePicker value={pageSize} totalItems={shown.length} hrefForSize={(n) => href({ per: n === PAGE_SIZE ? undefined : n, page: undefined })} />
        </div>
      </div>
    </div>
  );
}
