"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Wrench, Plus, Trash2 } from "lucide-react";
import type { ServicePart } from "@prisma/client";
import { servicePartLabel } from "@/lib/service-parts";
import { removeReplacedPartAction } from "@/app/actions/technician";
import { openAddPartForm } from "@/components/service/ChargesPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";
import { isNavigationSignal } from "@/lib/navigation-signal";

export type ReplacedPartRow = {
  id: string;
  part: ServicePart;
  item_name: string | null;
  sku: string | null;
  quantity: number;
  notes: string | null;
  recorded_by_name: string;
  created_at: string;
  photos: { id: string; file_url: string }[];
};

/**
 * Parts replaced during a service — a list, with their photos.
 *
 * A part is entered once, in Rincian Biaya ("Part — barang yang dipasang"),
 * with its price, supplier and photos (owner, 2026-11-06: nothing typed twice).
 * Before, it was recorded here and then priced there; "Tambah part" now opens
 * that form.
 *
 * The category is a picker and the item name is free text beside it, never
 * instead of it. Typing "ganti baterai" into one box would make the record
 * unreadable to any report — the same fault that forced the dashboard's brand
 * chart to be withdrawn, where "ASUS ROG" and "ROG JANGKAR" counted as two
 * manufacturers.
 *
 * The item itself is picked from the company catalogue when it is there
 * (Accurate, read through data.hnsitcenter.id), so the record carries a SKU a
 * report can count. Typing it by hand stays possible for what the catalogue
 * does not hold.
 */
export default function ReplacedPartsPanel({
  parts,
  canEdit,
  canAdd = false,
}: {
  parts: ReplacedPartRow[];
  /** May remove the parts they recorded (the server checks it is theirs). */
  canEdit: boolean;
  /** May add to the bill, where a part is entered (Rincian Biaya on this page). */
  canAdd?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const remove = (id: string, label: string) => {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof removeReplacedPartAction>>;
      try {
        result = await removeReplacedPartAction(id);
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menghapus. Periksa koneksi lalu coba lagi.");
        return;
      }
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label} dihapus dari catatan.`);
      router.refresh();
    });
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Wrench aria-hidden="true" className="size-4 text-primary" />
          Part yang Diganti
          {parts.length > 0 && (
            <span className="rounded-full border border-border bg-muted px-2 py-px text-[0.71875rem] font-bold text-muted-foreground">
              {parts.length}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-[0.8125rem]">
          Part yang dipasang pada tiket ini. Jenis dan kode Accurate-nya yang nanti dihitung di laporan.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {parts.length === 0 ? (
          <p className="text-[0.8125rem] text-muted-foreground italic">Belum ada part yang dicatat.</p>
        ) : (
          <ul>
            {parts.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[0.71875rem] font-bold whitespace-nowrap", TONE_CLASSES.blue)}>
                      {servicePartLabel(row.part)}
                    </span>
                    {row.item_name && <span className="text-sm font-semibold [overflow-wrap:anywhere]">{row.item_name}</span>}
                    {row.quantity > 1 && <span className="text-[0.8125rem] font-bold">× {row.quantity}</span>}
                    {row.sku && <span className="text-[0.71875rem] text-muted-foreground">SKU {row.sku}</span>}
                  </div>
                  {row.notes && (
                    <p className="mt-1.5 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">{row.notes}</p>
                  )}
                  {row.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.file_url}
                            alt={`Foto ${servicePartLabel(row.part)}`}
                            className="size-[58px] rounded-lg border border-border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.recorded_by_name} · {row.created_at}
                  </p>
                </div>

                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => remove(row.id, servicePartLabel(row.part))}
                    disabled={isPending}
                    aria-label={`Hapus catatan ${servicePartLabel(row.part)}`}
                    className="shrink-0 bg-card text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdd && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={openAddPartForm} className="self-start bg-card">
              <Plus aria-hidden="true" /> Tambah part
            </Button>
            <p className="text-xs text-muted-foreground">
              Part dicatat sekali di Rincian Biaya — jenis, barang, jumlah, supplier, harga, dan fotonya
              dalam satu form — lalu tampil di sini.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
