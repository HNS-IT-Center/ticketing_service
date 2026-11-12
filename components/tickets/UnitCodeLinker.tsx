"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, Loader2, X } from "lucide-react";
import { linkTicketUnitAction } from "@/app/actions/ticket-edit";
import CatalogItemPicker from "@/components/catalog/CatalogItemPicker";
import { Button } from "@/components/ui/button";
import { isNavigationSignal } from "@/lib/navigation-signal";
import type { CatalogItem } from "@/lib/catalog/items";

/**
 * One row of Lengkapi Kode Barang: search the catalogue starting from the name
 * typed at intake, pick the item, confirm. Nothing is saved on the pick alone —
 * a wrong suggestion is one click from being wrong on record.
 */
export default function UnitCodeLinker({ ticketId, typedName }: { ticketId: string; typedName: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!picked) return;
    startTransition(async () => {
      try {
        const res = await linkTicketUnitAction(ticketId, picked.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`Kode ${picked.sku} disimpan.`);
        router.refresh();
      } catch (err) {
        if (isNavigationSignal(err)) return;
        toast.error("Gagal menyimpan kode barang.");
      }
    });
  };

  if (picked) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-foreground">{picked.name}</p>
          <p className="text-xs text-muted-foreground">
            SKU <span className="font-mono">{picked.sku}</span>
            {picked.category ? ` · ${picked.category}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 *:flex-1 sm:*:flex-none">
          <Button type="button" variant="ghost" onClick={() => setPicked(null)} disabled={pending}>
            <X aria-hidden="true" /> Ganti
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
            Simpan
          </Button>
        </div>
      </div>
    );
  }
  return <CatalogItemPicker showStock={false} initialQuery={typedName} placeholder="Cari barang di katalog Accurate…" onPick={setPicked} />;
}
