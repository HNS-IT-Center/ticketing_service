import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { loadStoreClaims, withUnitCosts, type StoreClaimRow } from "@/lib/finance-claims-server";
import { heldMoney } from "@/lib/finance-claims";
import { accessFor } from "@/lib/access-server";
import { CLAIM_STAGES, CLAIM_STAGE_LABELS, financeQuery, readFinanceSearch, stageOfClaim, type FinanceSearch } from "@/lib/finance-filter";
import { rmaDecisionLabel } from "@/lib/rma/decision";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { wibDayKey } from "@/lib/store-dashboard";
import { parsePageSize } from "@/lib/pagination";
import { DaysPill, LOCATION_LABEL } from "@/components/finance/Speed";
import { CostNotice, HeldValue, UnitCost } from "@/components/finance/Money";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Klaim Stok Toko — HNS IT Center" };
const PAGE_SIZE = 25;
const YEAR_MS = 365 * 24 * 3600_000;
const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const d = (x: Date | null) => (x ? DATE.format(x) : "—");

/**
 * Every warranty claim on the shop's own stock, all stores, read only: the
 * vendor, the supplier's claim number, when it went out and came back, and
 * how long it has been there. A row opens the claim.
 */
export default async function FinanceClaimsPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const session = await requireRole("Finance", "Administrator");
  const raw = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const defaults = { fromDay: wibDayKey(now - YEAR_MS), toDay: wibDayKey(now) };
  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const p = readFinanceSearch(raw, stores.map((s) => s.id), now);

  const loaded = await loadStoreClaims({ storeId: p.storeId, q: p.q, createdStart: p.period.start, createdEnd: p.period.end }, now);
  const seesCost = (await accessFor(session.userId)).can("view_cost");
  const { rows: inPeriod, cost } = seesCost ? await withUnitCosts(loaded) : { rows: loaded, cost: "hidden" as const };
  // Figures only once the catalogue actually gives costs; until then a notice.
  const showMoney = cost === "ok";
  const vendors = [...new Map(inPeriod.filter((r) => r.vendorName).map((r) => [r.vendorKey, r.vendorName!])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const byVendor = p.vendorKey ? inPeriod.filter((r) => r.vendorKey === p.vendorKey) : inPeriod;
  const all = p.stage === "all" ? byVendor : byVendor.filter((r) => stageOfClaim(r) === p.stage);

  // Money held: units out on a claim and not back — at the vendor, or not sent yet.
  const heldAtVendor = heldMoney(all.filter((r) => stageOfClaim(r) === "at_vendor"));
  const heldNotSent = heldMoney(all.filter((r) => stageOfClaim(r) === "not_sent"));
  const heldTotal = heldMoney(all.filter((r) => stageOfClaim(r) !== "back"));

  const pageSize = parsePageSize(raw.per, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(raw.page || "1") || 1));
  const rows = all.slice((page - 1) * pageSize, page * pageSize);
  const href = (over: Record<string, string | undefined> = {}) => {
    const q = financeQuery(p, defaults, { per: pageSize !== PAGE_SIZE ? String(pageSize) : undefined, ...over });
    return `/finance/klaim${q ? `?${q}` : ""}`;
  };
  const exportQuery = financeQuery(p, defaults);

  const columns: DataTableColumn<StoreClaimRow>[] = [
    {
      key: "code",
      header: "Klaim",
      mobile: "title",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-mono whitespace-nowrap">{r.code}</span>
          {r.rmaCode && <span className="font-mono text-xs whitespace-nowrap text-primary">{r.rmaCode}</span>}
          <span className="text-xs text-muted-foreground">{r.store ?? "—"}</span>
        </span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      cell: (r) => (
        <span className="flex min-w-48 max-w-sm flex-col">
          <span title={r.device} className="line-clamp-2 font-medium">
            {r.brand ? `${r.brand} · ` : ""}
            {r.device}
          </span>
          {r.sn && <span className="text-xs text-muted-foreground">SN <span className="font-mono">{r.sn}</span></span>}
        </span>
      ),
    },
    ...(showMoney
      ? [
          {
            key: "cost",
            header: "Harga modal",
            mobileLabel: "Harga modal",
            cell: (r: StoreClaimRow) => (
              <span className="flex flex-col">
                <UnitCost cost={r.unitCost} catalogItemId={r.catalogItemId} />
                {r.unitCost !== null && stageOfClaim(r) !== "back" && <span className="text-xs text-tone-amber-fg">tertahan</span>}
              </span>
            ),
          } satisfies DataTableColumn<StoreClaimRow>,
        ]
      : []),
    {
      key: "vendor",
      header: "Vendor",
      cell: (r) =>
        r.vendorName ? (
          <span className="flex flex-col text-sm">
            <span>
              {r.vendorName}
              {r.vendorLocation ? <span className="text-xs text-muted-foreground"> · {LOCATION_LABEL[r.vendorLocation]}</span> : null}
            </span>
            {r.supplierClaimNumber && <span className="text-xs text-muted-foreground">No. klaim {r.supplierClaimNumber}</span>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">belum ada</span>
        ),
    },
    {
      key: "dates",
      header: "Dikirim / kembali",
      mobileLabel: "Dikirim",
      cell: (r) => (
        <span className="flex flex-col text-xs whitespace-nowrap text-muted-foreground">
          <span>Kirim: {d(r.submittedAt)}</span>
          <span>Kembali: {d(r.receivedAt ?? (r.span && !r.span.open ? r.closedAt : null))}</span>
          {r.decision && <span>Hasil: {rmaDecisionLabel(r.decision)}</span>}
        </span>
      ),
    },
    {
      key: "days",
      header: "Lama di vendor",
      mobile: "badge",
      cell: (r) =>
        r.span ? (
          <span className="flex flex-col gap-1">
            <DaysPill days={r.span.days} />
            {r.span.open && <span className="text-xs text-muted-foreground">masih di vendor</span>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">belum dikirim</span>
        ),
    },
    {
      key: "stage",
      header: "Tahap",
      cell: (r) => <StatusBadge {...ticketBadgeChoice(r.status, r.rmaStatus)} size="sm" />,
    },
  ];

  return (
    <div data-slot="finance-claims" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-6" /> Klaim Stok Toko
          </span>
        }
        description={`Klaim garansi unit stok toko · klaim masuk ${p.period.label}`}
        actions={
          <a href={`/finance/klaim/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden /> Export Excel
          </a>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/finance/klaim">
          {p.stage !== "all" && <input type="hidden" name="stage" value={p.stage} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Cari klaim" placeholder="Kode, RMA, unit, SN, vendor, no. klaim…" defaultValue={p.q} />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <FilterBarField label="Klaim masuk dari" htmlFor="fk-from" className="md:w-40">
              <Input id="fk-from" type="date" name="from" defaultValue={p.period.fromDay} className="bg-card" />
            </FilterBarField>
            <FilterBarField label="Sampai" htmlFor="fk-to" className="md:w-40">
              <Input id="fk-to" type="date" name="to" defaultValue={p.period.toDay} className="bg-card" />
            </FilterBarField>
          </div>
          <FilterBarField label="Vendor" htmlFor="fk-vendor" className="md:w-52">
            <NativeSelect id="fk-vendor" name="vendor" defaultValue={p.vendorKey ?? ""}>
              <option value="">Semua vendor</option>
              {vendors.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <FilterBarField label="Toko" htmlFor="fk-store" className="md:w-44">
            <NativeSelect id="fk-store" name="store" defaultValue={p.storeId ?? ""}>
              <option value="">Semua toko</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Terapkan</Button>
            {(p.q || p.vendorKey || p.storeId) && (
              <Link href={href({ q: undefined, vendor: undefined, store: undefined, page: undefined })} className={buttonVariants({ variant: "ghost" })}>
                Hapus
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips
          label="Tahap"
          active={p.stage}
          chips={CLAIM_STAGES.map((s) => ({
            key: s,
            label: `${CLAIM_STAGE_LABELS[s]} (${s === "all" ? byVendor.length : byVendor.filter((r) => stageOfClaim(r) === s).length})`,
            href: href({ stage: s === "all" ? undefined : s, page: undefined }),
          }))}
        />
      </div>

      <CostNotice cost={cost} withCode={inPeriod.filter((c) => c.catalogItemId !== null).length} total={inPeriod.length} />
      {showMoney && heldTotal.units > 0 && (
        <section aria-label="Uang tertahan" className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Uang tertahan (belum kembali)</span>
            <HeldValue held={heldTotal} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Masih di vendor</span>
            <HeldValue held={heldAtVendor} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Belum dikirim ke vendor</span>
            <HeldValue held={heldNotSent} />
          </div>
        </section>
      )}

      <DataTable
        caption="Klaim stok toko"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.ticketId}
        rowHref={(r) => `/finance/tickets/${r.ticketId}`}
        empty={<EmptyState icon={ShieldCheck} title="Tidak ada klaim stok toko yang cocok" />}
      />

      <div className="flex flex-col gap-2">
        {pages > 1 && <Pagination page={page} pageCount={pages} hrefForPage={(n) => href({ page: n > 1 ? String(n) : undefined })} className="sm:justify-center" />}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Menampilkan {rows.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + rows.length} dari {all.length} klaim
          </p>
          <PageSizePicker value={pageSize} totalItems={all.length} hrefForSize={(n) => href({ per: n === PAGE_SIZE ? undefined : String(n), page: undefined })} />
        </div>
      </div>
    </div>
  );
}
