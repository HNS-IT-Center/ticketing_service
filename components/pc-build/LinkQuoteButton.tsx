"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Link2, Loader2 } from "lucide-react";
import { linkQuoteToTicketAction } from "@/app/actions/link-quote";
import { FormField } from "@/components/app/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isHandledActionError } from "@/lib/navigation-signal";

/**
 * "Tautkan quotation" on a PC build that carries no quotation code, so the
 * e-commerce Dokumentasi Rakitan page can find its photos. Shown only to
 * holders of `edit_ticket`; the action checks it again.
 */
export default function LinkQuoteButton({ ticketId, ticketCode }: { ticketId: string; ticketCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await linkQuoteToTicketAction(ticketId, value);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success(`Tiket ditautkan ke quotation ${res.code}.`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        if (isHandledActionError(err)) return;
        setError("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-3 py-3 text-sm">
      <p className="text-muted-foreground">
        Tiket ini belum tertaut ke quotation, jadi foto rakitannya belum muncul di Dokumentasi Rakitan e-commerce.
      </p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (next) {
            setValue("");
            setError(null);
          }
          setOpen(next);
        }}
      >
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
          <Link2 aria-hidden="true" /> Tautkan quotation
        </Button>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tautkan {ticketCode} ke quotation</DialogTitle>
            <DialogDescription>
              Kode dicek ke web e-commerce dulu. Komponen di tiket tidak berubah, dan perubahan tercatat di Log Aktivitas.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <FormField label="Kode quotation atau tautannya" htmlFor={`${id}-quote`} required>
              <Input
                id={`${id}-quote`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="HNSPC-20261115-0165"
                autoComplete="off"
                required
                disabled={pending}
              />
            </FormField>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={pending || !value.trim()}>
                {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {pending ? "Mengecek…" : "Tautkan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
