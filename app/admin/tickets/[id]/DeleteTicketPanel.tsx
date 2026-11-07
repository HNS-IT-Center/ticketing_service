"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { checkTicketDeletionAction, deleteTicketAction } from "@/app/actions/admin";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isNavigationSignal } from "@/lib/navigation-signal";

type Inventory = Awaited<ReturnType<typeof checkTicketDeletionAction>>;

const DANGER = "bg-destructive text-white hover:bg-destructive/90";

/**
 * Permanent ticket deletion, for administrators.
 *
 * The dialog exists to make an irreversible action legible, not to slow it
 * down for its own sake. Before anything is destroyed it asks the server what
 * would go — status logs, messages, attachments, time logs, the RMA case and
 * its events — and prints the counts, because "are you sure?" over an unknown
 * quantity is not a question anyone can answer.
 *
 * Typing the ticket code is required. It is the one guard that cannot be
 * cleared by a mis-click, and the server checks it again: a confirmation only
 * the browser enforces is not a confirmation.
 */
export default function DeleteTicketPanel({
  ticketId,
  ticketCode,
}: {
  ticketId: string;
  ticketCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setInventory(await checkTicketDeletionAction(ticketId));
    } catch (err) {
      // Next moving the page (e.g. the login ran out) is not a failure.
      if (isNavigationSignal(err)) return;
      toast.error("Gagal memuat rincian tiket.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setInventory(null);
    setReason("");
    setConfirmation("");
  };

  const canDelete = reason.trim().length > 0 && confirmation.trim() === ticketCode;

  const submit = () => {
    startTransition(async () => {
      const result = await deleteTicketAction(ticketId, reason, confirmation);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Tiket ${result?.ticketCode} dihapus permanen.`);
      router.push("/admin/tickets");
      router.refresh();
    });
  };

  const destroys = inventory && "destroys" in inventory ? inventory.destroys : null;
  const credits = inventory && "credits" in inventory ? inventory.credits : null;

  return (
    <>
      <Card className="border border-destructive/30 ring-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
            <AlertTriangle aria-hidden="true" className="size-4" />
            Zona Berbahaya
          </CardTitle>
          <CardDescription className="text-[0.8125rem]">
            Menghapus tiket bersifat <strong className="text-foreground">permanen</strong> dan ikut membawa seluruh riwayat
            status, pesan, lampiran, dan case RMA-nya. Tidak bisa dibatalkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={openDialog} className={`w-full sm:w-auto ${DANGER}`}>
            <Trash2 aria-hidden="true" />
            Hapus tiket ini
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !next && !isPending && close()}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-[1.0625rem] font-semibold text-destructive">
              Hapus {ticketCode} permanen
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Menghitung yang akan ikut terhapus…
            </p>
          )}

          {destroys && (
            <>
              <Alert variant="destructive">
                <AlertDescription className="flex flex-col gap-2 text-[0.8125rem]">
                  <p className="font-bold">Yang ikut terhapus dan tidak bisa dikembalikan:</p>
                  <ul className="list-disc pl-4 leading-relaxed">
                    <li>{destroys.statusLogs} baris riwayat status</li>
                    <li>{destroys.messages} pesan</li>
                    <li>{destroys.attachments} lampiran (berkasnya ikut dihapus dari storage)</li>
                    <li>{destroys.timeLogs} catatan waktu kerja</li>
                    {destroys.rmaCode && (
                      <li>
                        <strong>Case RMA {destroys.rmaCode}</strong> beserta {destroys.rmaEvents}{" "}
                        riwayat perpindahan statusnya
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>

              {credits && credits.earningLogs + credits.failureLogs > 0 && (
                <Alert variant="warning">
                  <AlertDescription className="text-[0.8125rem]">
                    <p>
                      Poin teknisi akan dikembalikan: <strong>−{credits.points} poin</strong>,{" "}
                      {credits.earningLogs} tiket sukses dan {credits.failureLogs} gagal dikurangi
                      dari catatan performanya, supaya leaderboard dan profil tetap sama angkanya.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                label="Alasan penghapusan"
                htmlFor="delete-reason"
                required
                help="Disimpan beserta nama kamu di catatan penghapusan."
              >
                <Textarea
                  id="delete-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Contoh: salah input saat intake, tiket ganda"
                  className="resize-y bg-card"
                />
              </FormField>

              <FormField
                label={
                  <>
                    Ketik <code className="font-mono">{ticketCode}</code> untuk mengonfirmasi
                  </>
                }
                htmlFor="delete-confirmation"
                required
              >
                <Input
                  id="delete-confirmation"
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  className="bg-card font-mono"
                />
              </FormField>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                  Batal
                </Button>
                <Button type="button" onClick={submit} disabled={!canDelete || isPending} className={DANGER}>
                  {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                  {isPending ? "Menghapus…" : "Hapus permanen"}
                </Button>
              </DialogFooter>
            </>
          )}

          {inventory && "error" in inventory && inventory.error && (
            <p className="text-sm text-destructive">{inventory.error}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
