"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Ban, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { excludeTicketPointsAction, restoreTicketPointsAction } from "@/app/actions/ticket-points";

/**
 * "Hapus poin" / "Kembalikan poin" for one ticket. Administrator only — the
 * actions check that too. The ticket and its history stay; only what it earns
 * the technician goes.
 */
export function TicketPointsControl({
  ticketId,
  ticketCode,
  excluded,
  size = "default",
}: {
  ticketId: string;
  ticketCode: string;
  excluded: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");

  if (excluded) {
    return (
      <ConfirmDialog
        trigger={<Button variant="outline" size={size} />}
        triggerLabel={
          <>
            <RotateCcw aria-hidden="true" /> Kembalikan poin
          </>
        }
        title={`Kembalikan poin ${ticketCode}?`}
        description="Tiket ini dihitung lagi di leaderboard dan performa teknisi, dengan poin yang sama seperti saat dihapus."
        confirmLabel="Kembalikan poin"
        onConfirm={async () => {
          const r = await restoreTicketPointsAction(ticketId);
          if ("error" in r) throw new Error(r.error);
          toast.success(`Poin ${ticketCode} dikembalikan.`);
          router.refresh();
        }}
      />
    );
  }

  return (
    <ConfirmDialog
      trigger={<Button variant="outline" size={size} className="text-destructive" />}
      triggerLabel={
        <>
          <Ban aria-hidden="true" /> Hapus poin
        </>
      }
      variant="destructive"
      title={`Hapus poin ${ticketCode}?`}
      description={
        <span className="flex flex-col gap-3">
          <span>
            Tiketnya tetap ada dengan semua riwayatnya, tapi tidak lagi dihitung di leaderboard, performa, target dan
            laporan. Poin yang sudah masuk ke teknisi dikurangi. Bisa dikembalikan kapan saja.
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor={`exclude-${ticketId}`}>Alasan</Label>
            <Textarea
              id={`exclude-${ticketId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: tiket uji, customer ternyata staf sendiri"
              rows={3}
            />
          </span>
        </span>
      }
      confirmLabel="Hapus poin"
      onConfirm={async () => {
        const r = await excludeTicketPointsAction(ticketId, reason);
        if ("error" in r) throw new Error(r.error);
        toast.success(`Poin ${ticketCode} dihapus.`);
        setReason("");
        router.refresh();
      }}
    />
  );
}
