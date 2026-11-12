import Link from "next/link";
import { Barcode, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/page-access";
import { accessFor } from "@/lib/access-server";
import { UNIT_CODE_KINDS, UNIT_CODE_LABELS, isUnitCodeKind, unitCodeWhere, type UnitCodeKind } from "@/lib/unit-code-queue";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { ticketPartyName } from "@/lib/ticket-party";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import UnitCodeLinker from "@/components/tickets/UnitCodeLinker";

export const metadata = { title: "Lengkapi Kode Barang — HNS IT Center" };
const PAGE_SIZE = 20;

/**
 * Tickets whose unit was typed, to be given their Accurate item (owner,
 * 2026-11-12). Same right as "Ubah data tiket"; store-stock claims first,
 * because without a code their harga modal is missing from Finance.
 */
export default async function UnitCodePage({ searchParams }: { searchParams: Promise<{ jenis?: string; q?: string; page?: string }> }) {
  const session = await requirePage("edit_ticket");
  const params = await searchParams;
  const q = params.q ?? "";
  const counts = await Promise.all(UNIT_CODE_KINDS.map((k) => db.ticket.count({ where: unitCodeWhere(k, q) })));
  const countOf = (k: UnitCodeKind) => counts[UNIT_CODE_KINDS.indexOf(k)];
  // The first kind with work in it, unless one is asked for.
  const kind: UnitCodeKind = isUnitCodeKind(params.jenis) ? params.jenis : (UNIT_CODE_KINDS.find((k) => countOf(k) > 0) ?? "stok");
  const total = countOf(kind);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(params.page ?? "1") || 1), pages);

  const [tickets, access] = await Promise.all([
    db.ticket.findMany({
      where: unitCodeWhere(kind, q),
      // Open work first: a claim still at the desk is worth more than an old one.
      orderBy: [{ updated_at: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        ticket_code: true,
        ticket_type: true,
        status: true,
        technician_id: true,
        device_name: true,
        device_sn: true,
        created_at: true,
        is_for_self: true,
        customer_name: true,
        user: { select: { name: true } },
        store_location: { select: { code: true } },
        rma_case: { select: { id: true, status: true, rma_code: true, unit_ownership: true } },
        warranty_detail: { select: { unit_ownership: true } },
      },
    }),
    accessFor(session.userId),
  ]);
  const canOpen = access.can("page_tickets_all");

  const href = (over: { jenis?: string; page?: number; q?: string }) => {
    const qs = new URLSearchParams();
    const j = over.jenis ?? kind;
    qs.set("jenis", j);
    const query = over.q ?? q;
    if (query) qs.set("q", query);
    if (over.page && over.page > 1) qs.set("page", String(over.page));
    return `/admin/tickets/kode-barang?${qs}`;
  };

  return (
    <div data-slot="unit-code" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Barcode aria-hidden="true" className="size-6" /> Lengkapi Kode Barang
          </span>
        }
        description="Tiket yang unitnya dulu diketik manual, jadi belum tertaut ke barang di Accurate. Cari barangnya, pastikan benar, lalu simpan — nama unit ikut diganti nama katalog, nama lama tercatat di Log Aktivitas. Tiket baru yang unitnya diketik akan muncul di sini juga."
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/admin/tickets/kode-barang">
          <input type="hidden" name="jenis" value={kind} />
          <FilterBarSearch label="Cari tiket" placeholder="Cari kode tiket, nama unit, SN, atau customer…" defaultValue={q} />
          <Button type="submit" className="md:w-auto">
            Cari
          </Button>
        </FilterBar>
        <FilterChips
          label="Jenis tiket"
          active={kind}
          chips={UNIT_CODE_KINDS.map((k) => ({ key: k, label: `${UNIT_CODE_LABELS[k].label} (${countOf(k)})`, href: href({ jenis: k, page: 1 }) }))}
        />
        <p className="text-[0.8125rem] text-muted-foreground">{UNIT_CODE_LABELS[kind].hint}</p>
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Semua sudah punya kode barang." description={q ? "Tidak ada yang cocok dengan pencarian ini." : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    {canOpen ? (
                      <Link href={`/admin/tickets/${t.id}`} className="font-mono font-semibold text-primary hover:underline">
                        {t.ticket_code}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold">{t.ticket_code}</span>
                    )}
                    {t.rma_case && (
                      <Link href={`/rma/cases/${t.rma_case.id}`} className="font-mono text-xs text-muted-foreground hover:underline">
                        {t.rma_case.rma_code}
                      </Link>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {TICKET_TYPE_LABELS[t.ticket_type]}
                      {t.store_location ? ` · ${t.store_location.code}` : ""} · dibuat {t.created_at.toLocaleDateString("id-ID")}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Tercatat: </span>
                    <span className="font-medium text-foreground">{t.device_name?.trim() || "—"}</span>
                    {t.device_sn?.trim() && <span className="text-xs text-muted-foreground"> · SN {t.device_sn.trim()}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{ticketPartyName(t) ?? "—"}</p>
                </div>
                <StatusBadge {...ticketBadgeChoice(t.status, t.rma_case?.status)} hasTechnician={Boolean(t.technician_id)} size="sm" />
              </div>
              <UnitCodeLinker ticketId={t.id} typedName={t.device_name?.trim() ?? ""} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(p) => href({ page: p })} className="sm:justify-center" />}
    </div>
  );
}
