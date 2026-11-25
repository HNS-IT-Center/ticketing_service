import { PackageOpen } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STOCK_DATA_PENDING_WHERE, SWITCHED_TO_STORE_NOTE } from "@/lib/rma/ownership-change";
import ClaimStockDataForm from "./ClaimStockDataForm";

/**
 * Dashboard Stok: claims RMA switched from a customer's unit to Klaim Toko
 * whose stock data is still missing (owner, 2026-11-25). Admin Stok fills Asal
 * stok and Nomor Pemindahan Stok here; everyone else who sees the dashboard
 * reads the list. Renders nothing when nothing is waiting.
 */
export default async function ClaimStockDataCard({ storeIds, canFill }: { storeIds?: string[]; canFill: boolean }) {
  const cases = await db.rmaCase.findMany({
    where: { ...STOCK_DATA_PENDING_WHERE, ...(storeIds ? { ticket: { store_location_id: { in: storeIds } } } : {}) },
    orderBy: { handed_over_at: "asc" },
    take: 20,
    select: {
      id: true,
      rma_code: true,
      stock_origin: true,
      stock_transfer_number: true,
      ticket: { select: { ticket_code: true, device_name: true, device_sn: true, store_location: { select: { name: true } } } },
      events: {
        where: { note: { startsWith: SWITCHED_TO_STORE_NOTE } },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { note: true, created_at: true, actor: { select: { name: true } } },
      },
    },
  });
  if (cases.length === 0) return null;

  return (
    <Card className="gap-3 border-tone-amber-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <PackageOpen aria-hidden className="size-4 text-tone-amber-fg" /> Klaim Toko menunggu data stok · {cases.length}
        </CardTitle>
        <CardDescription>
          Klaim yang diubah RMA dari Klaim User menjadi Klaim Toko. {canFill ? "Isi asal stok dan nomor pemindahan stoknya." : "Diisi oleh Admin Stok."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {cases.map((c) => {
          const ev = c.events[0];
          const reason = ev?.note?.split("Alasan: ")[1]?.replace(/ \(sebelumnya .*\)$/, "");
          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-mono font-semibold">{c.rma_code}</span>
                  <span className="text-muted-foreground">#{c.ticket.ticket_code}</span>
                </span>
                <span className="text-sm">
                  {c.ticket.device_name ?? "—"}
                  {c.ticket.device_sn ? <span className="text-muted-foreground"> · SN {c.ticket.device_sn}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.ticket.store_location?.name ?? "—"}
                  {ev ? ` · diubah ${ev.actor.name}, ${formatDateTime(ev.created_at)}` : ""}
                  {reason ? ` · ${reason}` : ""}
                </span>
              </div>
              {canFill && <ClaimStockDataForm rmaCaseId={c.id} stockOrigin={c.stock_origin} transferNumber={c.stock_transfer_number} />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
