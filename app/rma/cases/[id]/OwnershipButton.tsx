"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Repeat } from "lucide-react";
import type { UnitOwnership } from "@prisma/client";
import { changeRmaOwnershipAction } from "@/app/actions/rma";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isHandledActionError } from "@/lib/navigation-signal";
import { OWNERSHIP_TEXT } from "@/lib/rma/ownership-change";

/**
 * "Ubah kepemilikan": Klaim User ⇄ Klaim Toko, set by the RMA desk directly,
 * with a reason. The stock data of a switch to Klaim Toko is Admin Stok's.
 * Rendered for the RMA role only while the case is open; the action checks
 * the same.
 */
export default function OwnershipButton({ rmaCaseId, rmaCode, current }: { rmaCaseId: string; rmaCode: string; current: UnitOwnership }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next: UnitOwnership = current === "customer" ? "store_stock" : "customer";

  const submit = (formData: FormData) => {
    setError(null);
    formData.set("rma_case_id", rmaCaseId);
    formData.set("unit_ownership", next);
    startTransition(async () => {
      try {
        const res = await changeRmaOwnershipAction(formData);
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        toast.success(`${rmaCode} sekarang ${OWNERSHIP_TEXT[next]}.`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        if (isHandledActionError(err)) return;
        setError("Gagal mengubah kepemilikan. Coba lagi.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) setError(null);
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Repeat aria-hidden="true" /> Ubah ke {OWNERSHIP_TEXT[next]}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah ke {OWNERSHIP_TEXT[next]}</DialogTitle>
          <DialogDescription>
            {rmaCode}: {OWNERSHIP_TEXT[current]} → {OWNERSHIP_TEXT[next]}. Tercatat di Riwayat RMA, dan kepala toko diberi tahu.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FormField label="Alasan" htmlFor={`${id}-reason`} required>
            <Textarea
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={500}
              rows={3}
              placeholder={next === "store_stock" ? "mis. Ditukar stok toko, distributor setuju tukar baru via WA" : "mis. Salah input, unit milik customer"}
            />
          </FormField>
          <p className={cn("text-xs text-muted-foreground")}>
            {next === "store_stock"
              ? "Asal stok dan nomor pemindahan stok diisi Admin Stok. Klaim tetap bisa dilanjutkan tanpa menunggu."
              : "Asal stok dan nomor pemindahan stok yang tercatat akan dihapus; nilai lamanya tetap ada di Riwayat RMA."}
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
