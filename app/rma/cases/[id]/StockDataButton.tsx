"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, PackageOpen } from "lucide-react";
import { fillClaimStockDataAction } from "@/app/actions/rma";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isHandledActionError } from "@/lib/navigation-signal";

/**
 * "Isi data stok" on a claim RMA switched to Klaim Toko: Asal stok and Nomor
 * Pemindahan Stok, filled by RMA (or Admin / Owner) whenever they are in hand
 * (owner, 2026-11-25). Rendered for those roles; the action checks the same.
 */
export default function StockDataButton({
  rmaCaseId,
  rmaCode,
  stockOrigin,
  transferNumber,
}: {
  rmaCaseId: string;
  rmaCode: string;
  stockOrigin: string | null;
  transferNumber: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const filled = Boolean(stockOrigin?.trim() && transferNumber?.trim());

  const submit = (formData: FormData) => {
    setError(null);
    formData.set("rma_case_id", rmaCaseId);
    startTransition(async () => {
      try {
        const res = await fillClaimStockDataAction(formData);
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        toast.success("Data stok tersimpan.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        if (isHandledActionError(err)) return;
        setError("Gagal menyimpan data stok. Coba lagi.");
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
      <Button type="button" variant={filled ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        <PackageOpen aria-hidden="true" /> {filled ? "Ubah data stok" : "Isi data stok"}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Data stok {rmaCode}</DialogTitle>
          <DialogDescription>Klaim ini diubah menjadi Klaim Toko. Catat stok toko yang dipakai untuk menukar unit customer.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FormField label="Asal stok" htmlFor={`${id}-origin`} required>
            <Input id={`${id}-origin`} name="stock_origin" required maxLength={500} defaultValue={stockOrigin ?? ""} placeholder="mis. Toko Nagoya Hill" />
          </FormField>
          <FormField label="Nomor Pemindahan Stok" htmlFor={`${id}-transfer`} required>
            <Input id={`${id}-transfer`} name="stock_transfer_number" required maxLength={191} defaultValue={transferNumber ?? ""} />
          </FormField>
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
