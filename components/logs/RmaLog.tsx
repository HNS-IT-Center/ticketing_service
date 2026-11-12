import Link from "next/link";
import { urlSort } from "@/lib/table-sort";
import { cn, formatDateTime } from "@/lib/utils";
import { rmaStatusMeta } from "@/components/rma/RmaStatusCard";
import { formatTimeOfDay } from "@/lib/rma/log-grouping";
import {
  CASES_PER_PAGE,
  EVENTS_PER_PAGE,
  LOG_FILTER_STATUSES,
  getRmaLogCases,
  getRmaLogEvents,
  hasAnyFilter,
  isRmaLogView,
  type RmaLogFilters,
  type RmaLogView,
} from "@/lib/rma/logs";
import { History, Search, ArrowRight, ChevronDown, Clock } from "lucide-react";
import type { Role } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveSearchInput } from "@/components/app/LiveSearchInput";
import { NativeSelect } from "@/components/ui/native-select";
import { rmaStatusDisplay, TONE_CLASSES } from "@/lib/status-display";

/** Who did it, coloured by role so the desk and the workshop read apart. */
const ROLE_TONES: Partial<Record<Role, string>> = {
  Technician: TONE_CLASSES.blue,
  RMA: TONE_CLASSES.violet,
};

function RoleChip({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "rounded-[5px] border px-1.5 py-px text-[0.6875rem] font-bold whitespace-nowrap",
        ROLE_TONES[role] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {role}
    </span>
  );
}

/**
 * Nothing to show — and, when the reader has walked past the last page, a way
 * back. The pagination strip hides itself once there is only one page, so
 * without this a stale `?page=` left the reader on a dead end that read
 * "Belum ada aktivitas RMA" although the log was full.
 */
function LogEmpty({
  page,
  lastPage,
  href,
  message,
}: {
  page: number;
  lastPage: number;
  href: string;
  message: string;
}) {
  const pastTheEnd = page > lastPage;
  return (
    <EmptyState
      icon={History}
      title={pastTheEnd ? `Halaman ${page} kosong — isinya berakhir di halaman ${lastPage}.` : message}
      action={
        pastTheEnd ? (
          <Link href={href} className={buttonVariants({ variant: "outline", className: "bg-card" })}>
            Kembali ke halaman 1
          </Link>
        ) : undefined
      }
    />
  );
}

type LogEvent = NonNullable<Awaited<ReturnType<typeof getRmaLogEvents>>>["days"][number]["items"][number];

export async function RmaLog({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;

  const filters: RmaLogFilters = {
    q: (params.q || "").trim(),
    status: params.status || "",
    from: params.from || "",
    to: params.to || "",
  };
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const view: RmaLogView = isRmaLogView(params.view) ? params.view : "case";
  const filtered = hasAnyFilter(filters);

  const grouped = view === "case" ? await getRmaLogCases(filters, page) : null;
  const chronological = view === "time" ? await getRmaLogEvents(filters, page) : null;

  const total = grouped?.total ?? chronological?.total ?? 0;
  const lastPage = grouped?.lastPage ?? chronological?.lastPage ?? 1;

  /** Keeps the filters when only the page or the view changes. */
  const hrefWith = (over: { view?: RmaLogView; page?: number }) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.status) sp.set("status", filters.status);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);

    const nextView = over.view ?? view;
    if (nextView !== "case") sp.set("view", nextView);

    // Switching view starts again at page one: page 3 of cases is not page 3
    // of events, and the two are not even counted in the same unit.
    const nextPage = over.page ?? (over.view ? 1 : page);
    if (nextPage > 1) sp.set("page", String(nextPage));

    const qs = sp.toString();
    return qs ? `/logs?jenis=rma&${qs}` : "/logs?jenis=rma";
  };

  const viewChips = [
    { key: "case", label: "Per Case", href: hrefWith({ view: "case" }) },
    { key: "time", label: "Kronologis", href: hrefWith({ view: "time" }) },
  ];

  // The chronological view, one table per day: Jam, Case, Perpindahan, Oleh,
  // Catatan on desktop. On a phone each event is a card — the time on top,
  // the new stage at the right, the rest as lines.
  const fromLabel = (e: LogEvent) => (e.from_status ? rmaStatusMeta(e.from_status).label : "Serah terima");
  const eventColumns: DataTableColumn<LogEvent>[] = [
    {
      key: "time", sortValue: (e) => e.created_at, sortFirst: "desc",
      header: "Jam",
      mobile: "title",
      className: "w-[72px] whitespace-nowrap",
      cell: (e) => (
        <span className="font-mono text-muted-foreground">{formatTimeOfDay(e.created_at)}</span>
      ),
    },
    {
      key: "case", sortValue: (e) => e.rma_case.rma_code,
      header: "Case",
      className: "w-[190px]",
      cell: (e) => (
        <span className="flex flex-col">
          <span className="font-mono text-[0.78125rem] font-bold whitespace-nowrap text-primary">{e.rma_case.rma_code}</span>
          <span className="text-xs text-muted-foreground">
            #{e.rma_case.ticket.ticket_code}
            {e.rma_case.ticket.customer_name ? ` · ${e.rma_case.ticket.customer_name}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "move", sortValue: (e) => e.to_status,
      header: "Perpindahan",
      mobile: "hidden",
      className: "w-[300px]",
      cell: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-[0.78125rem] text-muted-foreground">{fromLabel(e)}</span>
          <span aria-label="ke" className="text-muted-foreground">→</span>
          <StatusBadge kind="rma" status={e.to_status} size="sm" />
        </span>
      ),
    },
    // Phone-only: the new stage top right, and where it came from as a line.
    { key: "to", header: "Ke", mobile: "badge", className: "hidden", cell: (e) => <StatusBadge kind="rma" status={e.to_status} size="sm" /> },
    { key: "from", header: "Dari", className: "hidden", cell: (e) => fromLabel(e) },
    {
      key: "actor", sortValue: (e) => e.actor?.name,
      header: "Oleh",
      className: "w-[160px]",
      cell: (e) => (
        <span className="flex flex-col items-start gap-0.5">
          <span className="text-[0.78125rem]">{e.actor.name}</span>
          <RoleChip role={e.actor.role} />
        </span>
      ),
    },
    {
      key: "note",
      header: "Catatan",
      cell: (e) => <span className="whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{e.note || "—"}</span>,
    },
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="rma-logs" className="flex flex-col gap-5">
      <PageHeader
        title="Log Aktivitas RMA"
        description="Riwayat perpindahan status setiap case klaim. Dikelompokkan per case, jadi satu case bisa dibaca utuh dalam satu blok."
      />

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <FilterBar action="/logs" className="md:items-end">
          <input type="hidden" name="jenis" value="rma" />
          {/* The view survives a filter submit; without it every search would
              bounce the reader back to the grouped view. */}
          <input type="hidden" name="view" value={view} />
          <FilterBarField label="Cari" htmlFor="log-q" className="md:w-auto md:min-w-64 md:flex-1">
            <LiveSearchInput
              id="log-q"
              defaultValue={filters.q}
              placeholder="Kode RMA, tiket, customer, nama barang, atau catatan"
            />
          </FilterBarField>
          <FilterBarField label="Tahapan tujuan" htmlFor="log-status">
            <NativeSelect id="log-status" name="status" defaultValue={filters.status}>
              <option value="">Semua tahapan</option>
              {LOG_FILTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {rmaStatusMeta(s).label}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterBarField label="Dari tanggal" htmlFor="log-from" className="md:w-40">
              <Input id="log-from" type="date" name="from" defaultValue={filters.from} className="bg-card" />
            </FilterBarField>
            <FilterBarField label="Sampai tanggal" htmlFor="log-to" className="md:w-40">
              <Input id="log-to" type="date" name="to" defaultValue={filters.to} className="bg-card" />
            </FilterBarField>
          </div>
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">
              <Search aria-hidden="true" /> Terapkan
            </Button>
            {filtered && (
              <Link href={hrefWith({ page: 1 })} className={buttonVariants({ variant: "outline", className: "bg-card" })}>
                Reset
              </Link>
            )}
          </div>
        </FilterBar>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[0.8125rem] text-muted-foreground">
            {view === "case"
              ? `${total} case cocok${filtered ? " dengan filter" : ""}`
              : `${total} kejadian${filtered ? " cocok dengan filter" : ""}`}
          </span>
          <FilterChips label="Cara menampilkan log" chips={viewChips} active={view} />
        </div>
      </div>

      {/* ══ Per case ═══════════════════════════════════════════════════ */}
      {grouped &&
        (grouped.cases.length === 0 ? (
          <LogEmpty
            page={page}
            lastPage={grouped.lastPage}
            href={hrefWith({ page: 1 })}
            message={
              filtered ? "Tidak ada case yang cocok dengan filter ini." : "Belum ada aktivitas RMA."
            }
          />
        ) : (
          <div className="flex flex-col gap-3.5">
            {grouped.cases.map((c, index) => (
              <details
                key={c.id}
                /* The newest few open, so the page says something before any
                   clicking; the rest stay shut so it can still be scanned. */
                open={index < 3}
                className="group overflow-hidden rounded-xl border border-border bg-card shadow-xs"
              >
                <summary className="block cursor-pointer list-none p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:px-5 [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                      <StatusBadge kind="rma" status={c.status} />
                      <span className="font-mono text-[0.90625rem] font-bold">{c.rma_code}</span>
                      <span className="text-[0.8125rem] text-muted-foreground">#{c.ticket.ticket_code}</span>
                      {c.ticket.store_location && (
                        <span className="rounded-md border border-border bg-muted px-1.5 py-px text-[0.6875rem] font-bold text-muted-foreground">
                          {c.ticket.store_location.code}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="text-[0.8125rem] text-muted-foreground">{c.totalEvents} kejadian</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.71875rem] font-semibold whitespace-nowrap text-muted-foreground">
                        <Clock aria-hidden="true" className="size-[11px]" />
                        {c.stageAge}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-[18px] shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.8125rem] text-muted-foreground">
                    {c.ticket.customer_name && <span>{c.ticket.customer_name}</span>}
                    {c.ticket.device_name && <span>{c.ticket.device_name}</span>}
                    {c.ticket.device_sn && <span>SN {c.ticket.device_sn}</span>}
                    <span>PIC {c.handler?.name ?? "belum ada"}</span>
                    {c.ticket.technician && <span>Teknisi {c.ticket.technician.name}</span>}
                  </div>

                  {/* Only worth saying when the filter picked out part of the
                      case: the rest of the timeline below it did not match. */}
                  {filtered && c.matchedEvents < c.totalEvents && (
                    <div className="mt-2 text-xs text-muted-foreground italic">
                      Filter cocok pada {c.matchedEvents} dari {c.totalEvents} kejadian — riwayat
                      lengkapnya tetap ditampilkan.
                    </div>
                  )}
                </summary>

                <div className="border-t border-border p-4 md:px-5">
                  <Link href={`/rma/cases/${c.id}`} className={buttonVariants({ className: "mb-4 w-full sm:w-auto" })}>
                    Buka halaman case
                    <ArrowRight aria-hidden="true" />
                  </Link>

                  <ol>
                    {c.events.map((e) => {
                      const to = rmaStatusMeta(e.to_status);
                      const from = e.from_status ? rmaStatusMeta(e.from_status) : null;
                      const Icon = to.Icon;

                      return (
                        <li key={e.id} className="relative flex gap-3.5">
                          <div className="relative flex w-[30px] shrink-0 justify-center">
                            {!e.isLast && (
                              <span aria-hidden="true" className="absolute top-[30px] bottom-0 left-[14px] w-0.5 bg-border" />
                            )}
                            <span
                              className={cn(
                                "flex size-[30px] shrink-0 items-center justify-center rounded-full border",
                                TONE_CLASSES[rmaStatusDisplay(e.to_status).tone],
                              )}
                            >
                              <Icon aria-hidden="true" className="size-3.5" />
                            </span>
                          </div>

                          <div className={cn("min-w-0 flex-1 pt-1", !e.isLast && "pb-[1.125rem]")}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
                              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                {from && (
                                  <>
                                    <span className="text-[0.84375rem] text-muted-foreground">{from.label}</span>
                                    <ArrowRight aria-label="ke" className="size-[13px] shrink-0 text-muted-foreground" />
                                  </>
                                )}
                                <strong className="text-[0.90625rem]">{to.label}</strong>
                              </span>
                              <span className="font-mono text-[0.78125rem] whitespace-nowrap text-muted-foreground">
                                {formatDateTime(e.created_at)}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[0.8125rem] text-muted-foreground">{e.actor.name}</span>
                              <RoleChip role={e.actor.role} />
                              {e.gap && (
                                <span className="rounded-full border border-border bg-muted px-2 py-px font-mono text-[0.71875rem] text-muted-foreground">
                                  +{e.gap} dari langkah sebelumnya
                                </span>
                              )}
                            </div>

                            {e.note ? (
                              <p className="mt-2 rounded-r-lg border-l-[3px] border-primary bg-muted px-3 py-2 text-[0.84375rem] whitespace-pre-line text-foreground [overflow-wrap:anywhere]">
                                {e.note}
                              </p>
                            ) : (
                              <p className="mt-1.5 text-[0.78125rem] text-muted-foreground italic">Tanpa catatan</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        ))}

      {/* ══ Kronologis ═════════════════════════════════════════════════ */}
      {chronological &&
        (chronological.days.length === 0 ? (
          <LogEmpty
            page={page}
            lastPage={chronological.lastPage}
            href={hrefWith({ page: 1 })}
            message={
              filtered
                ? "Tidak ada aktivitas yang cocok dengan filter ini."
                : "Belum ada aktivitas RMA."
            }
          />
        ) : (
          <div className="flex flex-col gap-5">
            {chronological.days.map((day) => (
              <section key={day.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold text-foreground">{day.label}</h2>
                  <span className="text-[0.78125rem] text-muted-foreground">
                    {day.items.length} kejadian · {day.caseCount} case
                  </span>
                </div>
                <DataTable
                  caption={`Aktivitas RMA ${day.label}`}
                  sort={urlSort("/logs", { ...params, jenis: "rma" })}
                  columns={eventColumns}
                  rows={day.items}
                  getRowKey={(e) => e.id}
                  rowHref={(e) => `/rma/cases/${e.rma_case.id}`}
                />
              </section>
            ))}
          </div>
        ))}

      {/* ── Halaman ─────────────────────────────────────────────────────── */}
      {lastPage > 1 && (
        <nav
          aria-label="Halaman"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 md:p-4"
        >
          {page > 1 ? (
            <Link href={hrefWith({ page: page - 1 })} className={buttonVariants({ variant: "outline", className: "bg-card" })}>
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="order-first w-full text-center text-[0.8125rem] text-muted-foreground sm:order-none sm:w-auto">
            Halaman {page} dari {lastPage} ·{" "}
            {view === "case" ? `${CASES_PER_PAGE} case` : `${EVENTS_PER_PAGE} kejadian`} per halaman
          </span>
          {page < lastPage ? (
            <Link href={hrefWith({ page: page + 1 })} className={buttonVariants({ variant: "outline", className: "bg-card" })}>
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <p className="flex items-center gap-2 text-[0.78125rem] text-muted-foreground">
        <History aria-hidden="true" className="size-3.5 shrink-0" />
        Setiap baris adalah satu perpindahan status yang dicatat sistem. Tidak bisa diubah atau
        dihapus dari aplikasi.
      </p>
    </div>
  );
}
