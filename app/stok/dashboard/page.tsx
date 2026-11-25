import { requirePage } from "@/lib/page-access";
import { scopedStoreIds, storeScopeFor } from "@/lib/store-scope-server";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Cpu, Hammer, PackageCheck, PackageSearch, Wrench } from "lucide-react";
import { parsePeriod, wibDayKey } from "@/lib/store-dashboard";
import { loadOutgoingParts, loadStockSummary } from "@/lib/stock-server";
import { OUTGOING_KIND_LABELS } from "@/lib/stock";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PhotoStrip } from "@/components/stok/PhotoStrip";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { EmptyState } from "@/components/app/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PartCodeAlertCard from "@/components/service/PartCodeAlertCard";

export const metadata = { title: "Dashboard Stok — HNS IT Center" };

/**
 * Admin Stok's overview on one screen, read only: where the PC builds are,
 * and the parts that went out most recently.
 */
export default async function StockDashboardPage() {
  const session = await requirePage("page_stock_dashboard");
  // A kepala toko sees the stores they hold; everyone else every store.
  const scope = await storeScopeFor(session);
  const storeIds = scopedStoreIds(scope, null);
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const month = parsePeriod({ period: "month" }, now);
  // The uncoded count covers a year: codes arrive late, and the list it opens can show that much.
  const year = parsePeriod({ period: "range", from: wibDayKey(now - 365 * 24 * 3600_000), to: wibDayKey(now) }, now);
  const [{ builds, partsThisMonth, uncodedParts }, recent] = await Promise.all([
    loadStockSummary(now, month.start, year.start, storeIds),
    loadOutgoingParts({ start: month.start, end: month.end, storeIds }),
  ]);

  const building = builds.filter((b) => b.stage === "building").length;
  const finished = builds.filter((b) => b.stage === "finished").sort((a, b) => b.days - a.days);
  const newThisMonth = builds.filter((b) => b.createdAt >= month.start).length;

  return (
    <div data-slot="stock-dashboard" className="flex flex-col gap-5">
      <PageHeader title="Dashboard Stok" description={`Rakitan PC dan part yang keluar, ${storeIds ? scope.stores.map((s) => s.name).join(", ") : "semua toko"} · ${month.label}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Rakitan baru bulan ini" value={newThisMonth} icon={Cpu} href="/stok/rakitan" />
        <StatCard label="Sedang dirakit" value={building} icon={Hammer} href="/stok/rakitan?filter=building" />
        <StatCard label="Selesai, belum diserahkan" value={finished.length} icon={PackageCheck} href="/stok/rakitan?filter=finished" />
        <StatCard label="Part ganti bulan ini" value={partsThisMonth} icon={Wrench} href="/stok/part?kind=service" />
        <StatCard
          label="Part tanpa kode Accurate"
          value={uncodedParts}
          icon={PackageSearch}
          tone={uncodedParts ? "warning" : "default"}
          href={`/stok/part?kind=service&uncoded=1&period=range&from=${year.fromDay}&to=${year.toDay}`}
          hint="12 bulan terakhir"
        />
      </div>

      {/* Moved here from the admin dashboard (owner, 2026-11-13): chasing the code is stock work. */}
      <PartCodeAlertCard scope={storeIds ? { store_location_id: { in: storeIds } } : {}} portal="stok" showTechnician />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="flex items-center gap-2">
                <Cpu aria-hidden className="size-4 text-primary" /> Rakitan selesai, belum diserahkan
              </span>
              <Link href="/stok/rakitan?filter=finished" className="text-sm font-medium text-primary hover:underline">
                Semua
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {finished.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Tidak ada rakitan yang menunggu diserahkan" className="py-8 md:py-8" />
            ) : (
              finished.slice(0, 6).map((r) => (
                <Link
                  key={r.ticketId}
                  href={`/stok/tickets/${r.ticketId}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{r.code}</span>
                      <StatusBadge kind="ticket" status={r.status} hasTechnician={Boolean(r.technician)} size="sm" />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.customer} · {r.store ?? "—"} · {r.components} komponen · teknisi {r.technician ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{r.days} hari</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))
            )}
            {finished.length > 6 && (
              <Link href="/stok/rakitan?filter=finished" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
                +{finished.length - 6} lainnya
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="flex items-center gap-2">
                <PackageSearch aria-hidden className="size-4 text-primary" /> Part keluar terbaru
              </span>
              <Link href="/stok/part" className="text-sm font-medium text-primary hover:underline">
                Semua
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {recent.length === 0 ? (
              <EmptyState icon={PackageSearch} title="Belum ada part keluar bulan ini" className="py-8 md:py-8" />
            ) : (
              recent.slice(0, 6).map((r) => (
                <div key={r.key} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <PhotoStrip size="sm" max={1} photos={r.photos} />
                  <Link href={`/stok/tickets/${r.ticketId}`} className="flex min-w-0 flex-1 flex-col outline-none hover:underline focus-visible:underline">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {OUTGOING_KIND_LABELS[r.kind]} · {r.code} · {r.store ?? "—"} · {formatDateTime(r.at)}
                    </span>
                  </Link>
                  {r.sku ? (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.sku}</span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-tone-amber-border bg-tone-amber-bg px-2 py-0.5 text-[0.7rem] font-semibold text-tone-amber-fg">
                      tanpa kode
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
