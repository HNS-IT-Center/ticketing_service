import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import { scopedStoreIds, storeScopeFor } from "@/lib/store-scope-server";
import Link from "next/link";
import { CircleDollarSign, Clock, Landmark, PackageOpen, Send, Timer } from "lucide-react";
import { heldMoney, heldMoneyByVendor, SLOW_DAYS, VERY_SLOW_DAYS, vendorRows, type VendorRow } from "@/lib/finance-claims";
import { accessFor } from "@/lib/access-server";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { asVendorClaims, loadStoreClaims, withUnitCosts } from "@/lib/finance-claims-server";
import { financeQuery, readFinanceSearch, type FinanceSearch } from "@/lib/finance-filter";
import { wibDayKey } from "@/lib/store-dashboard";
import { DaysPill, LOCATION_LABEL } from "@/components/finance/Speed";
import { CostNotice, HeldValue } from "@/components/finance/Money";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = { title: "Kinerja Vendor Klaim — HNS IT Center" };

const YEAR_MS = 365 * 24 * 3600_000;

/**
 * Which vendors are slow with the shop's own claimed stock: per vendor, how
 * many claims went out in the period, how many are still there, and how long
 * one takes to come back. Read only.
 */
export default async function FinanceDashboardPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const session = await requirePage("page_finance_vendors");
  const raw = await searchParams;
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const defaults = { fromDay: wibDayKey(now - YEAR_MS), toDay: wibDayKey(now) };
  // A kepala toko granted this page sees the stores they hold.
  const scope = await storeScopeFor(session);
  const stores = scope.stores;
  const p = readFinanceSearch(raw, stores.map((s) => s.id), now);

  const loaded = await loadStoreClaims({ storeIds: scopedStoreIds(scope, p.storeId), sentStart: p.period.start, sentEnd: p.period.end }, now);
  // Harga modal only for a viewer allowed it (Pengaturan Akses → Lihat harga modal).
  const seesCost = (await accessFor(session.userId)).can("view_cost");
  const { rows: claims, cost } = seesCost ? await withUnitCosts(loaded) : { rows: loaded, cost: "hidden" as const };
  // Figures only once the catalogue actually gives costs; until then a notice.
  const showMoney = cost === "ok";
  // Still at the vendor: the shop's stock is out and nothing has come back yet.
  const atVendor = claims.filter((c) => c.span?.open);
  const held = heldMoney(atVendor);
  const heldByVendor = heldMoneyByVendor(atVendor);
  const vendors = vendorRows(asVendorClaims(claims), now);
  const sent = vendors.reduce((n, v) => n + v.sent, 0);
  const open = vendors.reduce((n, v) => n + v.open, 0);
  const openSlow = vendors.reduce((n, v) => n + v.openSlow, 0);
  const returned = claims.filter((c) => c.span && !c.span.open).map((c) => c.span!.days).sort((a, b) => a - b);
  const medianAll = returned.length ? returned[Math.floor(returned.length / 2)] : null;

  const listHref = (vendorKey?: string) => {
    const q = financeQuery({ ...p, stage: "all", q: "" }, defaults, { vendor: vendorKey, from: undefined, to: undefined });
    return `/finance/klaim${q ? `?${q}` : ""}`;
  };

  // The vendor's location (LKL / ITR) comes from the vendor list.
  const locations = new Map(claims.filter((c) => c.vendorLocation).map((c) => [c.vendorKey, c.vendorLocation!]));

  const columns: DataTableColumn<VendorRow>[] = [
    {
      key: "vendor", sortValue: (v) => v.name,
      header: "Vendor",
      mobile: "title",
      cell: (v) => {
        const where = locations.get(v.key);
        return (
          <span className="flex flex-col">
            <span className="font-medium">{v.name}</span>
            {where && (
              <span className="text-xs text-muted-foreground">
                {LOCATION_LABEL[where]} · {where === "in_town" ? "dalam kota" : "luar kota"}
              </span>
            )}
          </span>
        );
      },
    },
    { key: "sent", sortValue: (v) => v.sent, sortFirst: "desc", header: "Dikirim", className: "tabular-nums", cell: (v) => v.sent },
    {
      key: "open", sortValue: (v) => v.open, sortFirst: "desc",
      header: "Masih di vendor",
      cell: (v) => (
        <span className="flex flex-col">
          <span className="tabular-nums">{v.open}</span>
          {v.openSlow > 0 && <span className="text-xs text-tone-red-fg">{v.openSlow} lewat {SLOW_DAYS} hari</span>}
        </span>
      ),
    },
    ...(showMoney
      ? [
          {
            key: "held", sortValue: (v: VendorRow) => heldByVendor.get(v.key)?.value, sortFirst: "desc",
            header: "Uang tertahan",
            cell: (v: VendorRow) => {
              const h = heldByVendor.get(v.key);
              return h ? <HeldValue held={h} compact /> : <span className="text-muted-foreground">—</span>;
            },
          } satisfies DataTableColumn<VendorRow>,
        ]
      : []),
    { key: "longest", sortValue: (v) => v.longestOpen, sortFirst: "desc", header: "Terlama masih terbuka", mobileLabel: "Terlama terbuka", cell: (v) => <DaysPill days={v.longestOpen} /> },
    {
      key: "ret", sortValue: (v) => v.medianReturn, sortFirst: "desc",
      header: "Lama sampai kembali",
      mobile: "badge",
      cell: (v) => (
        <span className="flex flex-col gap-1">
          <DaysPill days={v.medianReturn} suffix="hari (median)" />
          {v.avgReturn !== null && <span className="text-xs text-muted-foreground">rata-rata {v.avgReturn} hari</span>}
        </span>
      ),
    },
    { key: "dec", sortValue: (v) => v.medianDecision, sortFirst: "desc", header: "Sampai keputusan", cell: (v) => (v.medianDecision === null ? "—" : <span className="tabular-nums">{v.medianDecision} hari</span>) },
    {
      key: "result", sortValue: (v) => v.approved, sortFirst: "desc",
      header: "Hasil",
      cell: (v) => (
        <span className="text-sm whitespace-nowrap">
          <span className="text-tone-green-fg">{v.approved} disetujui</span>
          {v.rejected > 0 && <span className="text-tone-red-fg"> · {v.rejected} ditolak</span>}
        </span>
      ),
    },
  ];

  return (
    <div data-slot="finance-dashboard" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Landmark aria-hidden className="size-6" /> Kinerja Vendor Klaim
          </span>
        }
        description={`Klaim stok toko yang dikirim ke vendor · ${p.period.label}`}
      />

      <FilterBar action="/finance/dashboard">
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Dikirim dari" htmlFor="fd-from" className="md:w-40">
            <Input id="fd-from" type="date" name="from" defaultValue={p.period.fromDay} className="bg-card" />
          </FilterBarField>
          <FilterBarField label="Sampai" htmlFor="fd-to" className="md:w-40">
            <Input id="fd-to" type="date" name="to" defaultValue={p.period.toDay} className="bg-card" />
          </FilterBarField>
        </div>
        <FilterBarField label="Toko" htmlFor="fd-store" className="md:w-48">
          <NativeSelect id="fd-store" name="store" defaultValue={p.storeId ?? ""}>
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </FilterBarField>
        <Button type="submit">Terapkan</Button>
      </FilterBar>

      <CostNotice cost={cost} withCode={claims.filter((c) => c.catalogItemId !== null).length} total={claims.length} />

      <div className={showMoney ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" : "grid grid-cols-2 gap-3 md:grid-cols-4"}>
        <StatCard label="Klaim dikirim ke vendor" value={sent} icon={Send} />
        <StatCard label="Masih di vendor" value={open} icon={PackageOpen} tone={open ? "warning" : "default"} href={`/finance/klaim?stage=at_vendor`} />
        <StatCard label={`Lewat ${SLOW_DAYS} hari di vendor`} value={openSlow} icon={Clock} tone="attention" href={`/finance/klaim?stage=at_vendor`} />
        {showMoney && (
          <StatCard
            label="Uang tertahan di vendor"
            value={held.units > held.unpriced ? formatRupiahCompact(held.value) : "—"}
            icon={CircleDollarSign}
            tone={held.value ? "warning" : "default"}
            hint={
              held.units > held.unpriced
                ? `${formatRupiah(held.value)} · ${held.units} unit${held.unpriced ? `, ${held.unpriced} tanpa harga modal` : ""}`
                : `${held.units} unit, harga modal belum ada`
            }
            href="/finance/klaim?stage=at_vendor"
          />
        )}
        <StatCard label="Median sampai kembali" value={medianAll === null ? "—" : `${medianAll} hari`} icon={Timer} hint={`${returned.length} klaim sudah kembali`} />
      </div>

      <DataTable
        caption="Kinerja vendor klaim"
        sort={urlSort("/finance/dashboard", raw)}
        columns={columns}
        rows={vendors}
        getRowKey={(v) => v.key}
        rowHref={(v) => listHref(v.key)}
        empty={<EmptyState icon={Landmark} title="Belum ada klaim stok toko yang dikirim ke vendor di periode ini" />}
      />

      <p className="text-xs text-muted-foreground">
        Lama di vendor dihitung dari klaim dikirim ke vendor sampai unit, penggantinya, atau refund kembali; yang belum kembali dihitung sampai
        hari ini. Kuning: {SLOW_DAYS} hari atau lebih · merah: {VERY_SLOW_DAYS} hari atau lebih.
        {showMoney && " Uang tertahan: harga modal (HPP Accurate) per unit dari klaim yang masih di vendor, satu unit per klaim."} Klik vendor
        untuk melihat klaimnya.{" "}
        <Link href="/finance/klaim" className="font-medium text-primary hover:underline">
          Semua klaim stok toko
        </Link>
      </p>
    </div>
  );
}
