"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";
import {
  applyAccurateItemToUnmappedAction,
  createServiceJobAction,
  setServiceJobAccurateItemAction,
  updateServiceJobAction,
} from "@/app/actions/service-jobs";
import CatalogItemPicker from "@/components/catalog/CatalogItemPicker";
import { FormField } from "@/components/app/FormField";
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
import { MAX_JOB_POINTS } from "@/lib/service-jobs";
import { cn } from "@/lib/utils";
import RupiahInput from "@/components/service/RupiahInput";

export type ServiceJobRowData = {
  id: string;
  name: string;
  default_price: number | null;
  points: number;
  is_active: boolean;
  /** How many bill lines use it — so nobody wonders why it cannot be deleted. */
  used: number;
  /** The Accurate service item the cashier enters for it. */
  accurate_sku: string | null;
  accurate_name: string | null;
};

/** Sends the picked Accurate item to an action, refreshing on success. */
function useAccuratePick() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const send = (
    action: (fd: FormData) => Promise<{ error?: string } | { success: boolean; count?: number }>,
    itemId: number | null,
    done: (r: { count?: number }) => string,
    after: () => void
  ) =>
    start(async () => {
      const fd = new FormData();
      fd.set("accurate_item_id", itemId === null ? "" : String(itemId));
      try {
        const r = await action(fd);
        if ("error" in r && r.error) return void toast.error(r.error);
        toast.success(done(r as { count?: number }));
        after();
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  return { pending, send };
}

const PICK_PLACEHOLDER = "Cari item jasa Accurate, mis. jasa service";

/**
 * The Accurate code printed beside this job on the invoice, so the cashier
 * types it instead of searching Accurate.
 */
export function AccurateItemCell({ job, canManage }: { job: ServiceJobRowData; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, send } = useAccuratePick();
  const save = (itemId: number | null) =>
    send(
      (fd) => setServiceJobAccurateItemAction(job.id, fd),
      itemId,
      () => (itemId === null ? "Kode Accurate dilepas." : "Kode Accurate disimpan."),
      () => setOpen(false)
    );
  if (open) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2 md:min-w-72">
        <CatalogItemPicker showStock={false} placeholder={PICK_PLACEHOLDER} onPick={(item) => save(item.id)} />
        <div className="flex gap-2">
          {job.accurate_sku && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => save(null)}>
              Lepas
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
            Batal
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {job.accurate_sku ? (
        <span>
          <strong className="font-mono">{job.accurate_sku}</strong>
          <span className="text-xs text-muted-foreground"> {job.accurate_name}</span>
        </span>
      ) : (
        <span className="text-xs text-tone-amber-fg">belum dipetakan</span>
      )}
      {canManage && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2.5" onClick={() => setOpen(true)}>
          {job.accurate_sku ? "Ganti" : "Pilih"}
        </Button>
      )}
    </div>
  );
}

/** One Accurate item for every job not mapped yet. */
export function ApplyAccurateItemForm({ unmapped }: { unmapped: number }) {
  const { pending, send } = useAccuratePick();
  if (unmapped === 0) return null;
  return (
    <section
      data-slot="apply-accurate-item"
      className="flex flex-col gap-3 rounded-xl border border-tone-amber-border bg-tone-amber-bg p-4 text-tone-amber-fg md:p-5"
    >
      <p className="text-sm">
        <strong>{unmapped} jasa</strong> belum punya kode Accurate. Kalau semuanya masuk Accurate sebagai item yang
        sama (mis. <em>JASA SERVICE</em>), pilih item itu sekali di sini; jasa yang sudah dipetakan tidak diubah.
      </p>
      <div className={cn("max-w-md text-foreground", pending && "opacity-60")}>
        <CatalogItemPicker
          showStock={false}
          placeholder={PICK_PLACEHOLDER}
          onPick={(item) =>
            send(applyAccurateItemToUnmappedAction, item.id, (r) => `${item.sku} dipasang ke ${r.count ?? 0} jasa.`, () => undefined)
          }
        />
      </div>
    </section>
  );
}

/** Runs an action; the form keeps what was typed when it fails. */
function useJobSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = (
    e: FormEvent<HTMLFormElement>,
    action: (fd: FormData) => Promise<{ error?: string } | { success: boolean }>,
    done: string,
    after: (form: HTMLFormElement) => void
  ) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      try {
        const r = await action(fd);
        if ("error" in r && r.error) return void toast.error(r.error);
        toast.success(done);
        after(form);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      }
    });
  };
  return { pending, submit };
}

function PointsInput({ id, defaultValue }: { id: string; defaultValue?: number }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">Poin</span>
      <Input
        id={id}
        name="points"
        type="number"
        min={0}
        max={MAX_JOB_POINTS}
        defaultValue={defaultValue ?? 0}
        className="bg-card"
        onWheel={(e) => e.currentTarget.blur()}
      />
    </label>
  );
}

export function NewServiceJobForm() {
  const { pending, submit } = useJobSubmit();
  // Remounted after a save so the price box empties with the rest of the form.
  const [round, setRound] = useState(0);
  return (
    <form
      key={round}
      data-slot="new-service-job"
      onSubmit={(e) =>
        submit(e, createServiceJobAction, "Jasa ditambahkan.", () => setRound((r) => r + 1))
      }
      className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-xs md:grid-cols-[2fr_1.4fr_0.7fr_auto] md:items-end md:p-5"
    >
      <label htmlFor="new-job-name" className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Nama jasa</span>
        <Input id="new-job-name" name="name" required minLength={2} placeholder="mis. Ganti LCD" className="bg-card" />
      </label>
      <RupiahInput name="default_price" label="Harga default (opsional)" />
      <PointsInput id="new-job-points" />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
        {pending ? "Menyimpan…" : "Tambah"}
      </Button>
    </form>
  );
}

/**
 * "Ubah": the edit form in a dialog. It used to replace the whole table row,
 * which on a phone card had nowhere to go.
 */
export function ServiceJobEditDialog({ job }: { job: ServiceJobRowData }) {
  const [open, setOpen] = useState(false);
  const { pending, submit } = useJobSubmit();

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="bg-card" />}>Ubah</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(e) =>
            submit(e, (fd) => updateServiceJobAction(job.id, fd), "Jasa diperbarui.", () => setOpen(false))
          }
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Ubah jasa</DialogTitle>
            <DialogDescription>
              Harga dan poin baru berlaku untuk jasa yang dicatat sesudah ini. Yang sudah tercatat tetap
              memakai nilai lamanya, jadi target bulan lalu tidak berubah.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Nama jasa" htmlFor={`job-name-${job.id}`} required>
            <Input id={`job-name-${job.id}`} name="name" defaultValue={job.name} required minLength={2} className="bg-card" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_0.7fr]">
            <RupiahInput name="default_price" label="Harga default" defaultValue={job.default_price} />
            <PointsInput id={`job-points-${job.id}`} defaultValue={job.points} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm md:min-h-9">
            <input type="checkbox" name="is_active" value="1" defaultChecked={job.is_active} className="size-5 accent-primary md:size-4" />
            Aktif
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
