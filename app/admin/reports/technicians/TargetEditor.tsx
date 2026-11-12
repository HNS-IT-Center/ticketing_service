"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { saveTargetAction } from "@/app/actions/targets";
import RupiahInput from "@/components/service/RupiahInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isHandledActionError } from "@/lib/navigation-signal";

type Values = { jobs: number | null; revenue: number | null; points: number | null };

/**
 * Set a monthly target — the shop's default, or one technician's own — from
 * the month on screen onward. Earlier months keep the target they had.
 *
 * Opens in a dialog: the form used to unfold inside the table cell, which
 * pushed the whole table sideways.
 */
export default function TargetEditor({
  scope,
  month,
  monthText,
  initial,
  buttonLabel,
  title,
  canUseDefault = false,
  className,
}: {
  /** "default", or a technician's id. */
  scope: string;
  month: string;
  monthText: string;
  initial: Values;
  buttonLabel: string;
  /** The dialog's heading: whose target this is. */
  title: string;
  /** A technician with their own target may be sent back to the default. */
  canUseDefault?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const send = (fd: FormData, done: string) =>
    start(async () => {
      try {
        const r = await saveTargetAction(fd);
        if ("error" in r && r.error) return void toast.error(r.error);
        toast.success(done);
        setOpen(false);
        router.refresh();
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isHandledActionError(err)) return;
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("scope", scope);
    fd.set("month", month);
    send(fd, "Target disimpan.");
  };

  const backToDefault = () => {
    const fd = new FormData();
    fd.set("scope", scope);
    fd.set("month", month);
    fd.set("use_default", "1");
    send(fd, "Kembali memakai target umum.");
  };

  const numberField = (name: "jobs" | "points", label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        name={name}
        type="number"
        min={0}
        defaultValue={initial[name] ?? ""}
        placeholder="tanpa target"
        className="bg-card"
        onWheel={(e) => e.currentTarget.blur()}
      />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger render={<Button variant="outline" size="sm" className={cn("bg-card", className)} />}>
        {buttonLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <DialogDescription>
              Berlaku mulai <strong className="text-foreground">{monthText}</strong> sampai diubah lagi. Bulan sebelumnya
              tetap dinilai dengan target lamanya. Kosongkan kolom yang tidak ditargetkan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {numberField("jobs", "Jasa / bulan")}
            <RupiahInput name="revenue" label="Omzet jasa / bulan" defaultValue={initial.revenue} placeholder="tanpa target" />
            {numberField("points", "Poin / bulan")}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            {canUseDefault && (
              <Button type="button" variant="secondary" disabled={pending} onClick={backToDefault}>
                Pakai target umum
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {pending ? "Menyimpan…" : "Simpan target"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
