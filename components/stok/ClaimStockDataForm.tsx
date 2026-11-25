"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { fillClaimStockDataAction } from "@/app/actions/rma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isHandledActionError } from "@/lib/navigation-signal";

/** Admin Stok's two fields for a claim RMA switched to Klaim Toko. */
export default function ClaimStockDataForm({
  rmaCaseId,
  stockOrigin,
  transferNumber,
}: {
  rmaCaseId: string;
  stockOrigin: string | null;
  transferNumber: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        router.refresh();
      } catch (err) {
        if (isHandledActionError(err)) return;
        setError("Gagal menyimpan data stok. Coba lagi.");
      }
    });
  };

  return (
    <form action={submit} className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-origin`} className="text-xs">
          Asal stok
        </Label>
        <Input id={`${id}-origin`} name="stock_origin" required maxLength={500} defaultValue={stockOrigin ?? ""} placeholder="mis. Toko Nagoya Hill" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-transfer`} className="text-xs">
          Nomor Pemindahan Stok
        </Label>
        <Input id={`${id}-transfer`} name="stock_transfer_number" required maxLength={191} defaultValue={transferNumber ?? ""} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 aria-hidden="true" className="animate-spin" />} Simpan
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive md:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
