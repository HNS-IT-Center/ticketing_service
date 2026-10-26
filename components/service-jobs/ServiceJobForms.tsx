"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  applyAccurateItemToUnmappedAction,
  createServiceJobAction,
  setServiceJobAccurateItemAction,
  updateServiceJobAction,
} from "@/app/actions/service-jobs";
import CatalogItemPicker from "@/components/catalog/CatalogItemPicker";
import { formatRupiah } from "@/lib/charges";
import { MAX_JOB_POINTS } from "@/lib/service-jobs";
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
function AccurateItemCell({ job, canManage }: { job: ServiceJobRowData; canManage: boolean }) {
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
      <div className="flex flex-col gap-2" style={{ minWidth: "18rem" }}>
        <CatalogItemPicker showStock={false} placeholder={PICK_PLACEHOLDER} onPick={(item) => save(item.id)} />
        <div className="flex gap-2">
          {job.accurate_sku && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => save(null)}>
              Lepas
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
            Batal
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {job.accurate_sku ? (
        <span>
          <strong style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{job.accurate_sku}</strong>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {" "}
            {job.accurate_name}
          </span>
        </span>
      ) : (
        <span className="text-xs" style={{ color: "#92400e" }}>
          belum dipetakan
        </span>
      )}
      {canManage && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {job.accurate_sku ? "Ganti" : "Pilih"}
        </button>
      )}
    </div>
  );
}

/** One Accurate item for every job not mapped yet. */
export function ApplyAccurateItemForm({ unmapped }: { unmapped: number }) {
  const { pending, send } = useAccuratePick();
  if (unmapped === 0) return null;
  return (
    <div className="card flex flex-col gap-2">
      <p className="text-sm" style={{ margin: 0 }}>
        <strong>{unmapped} jasa</strong> belum punya kode Accurate. Kalau semuanya masuk Accurate sebagai item yang
        sama (mis. <em>JASA SERVICE</em>), pilih item itu sekali di sini; jasa yang sudah dipetakan tidak diubah.
      </p>
      <div style={{ maxWidth: "28rem", opacity: pending ? 0.6 : 1 }}>
        <CatalogItemPicker
          showStock={false}
          placeholder={PICK_PLACEHOLDER}
          onPick={(item) =>
            send(applyAccurateItemToUnmappedAction, item.id, (r) => `${item.sku} dipasang ke ${r.count ?? 0} jasa.`, () => undefined)
          }
        />
      </div>
    </div>
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

function PointsInput({ defaultValue }: { defaultValue?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        Poin
      </span>
      <input
        name="points"
        type="number"
        min={0}
        max={MAX_JOB_POINTS}
        defaultValue={defaultValue ?? 0}
        className="form-input"
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
      onSubmit={(e) =>
        submit(e, createServiceJobAction, "Jasa ditambahkan.", () => setRound((r) => r + 1))
      }
      className="card grid gap-3 md:grid-cols-[2fr_1.4fr_0.7fr_auto] md:items-end"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Nama jasa
        </span>
        <input name="name" required minLength={2} className="form-input" placeholder="mis. Ganti LCD" />
      </label>
      <RupiahInput name="default_price" label="Harga default (opsional)" />
      <PointsInput />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah"}
      </button>
    </form>
  );
}

export function ServiceJobRow({ job, canManage }: { job: ServiceJobRowData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, submit } = useJobSubmit();

  if (!editing) {
    return (
      <tr style={{ opacity: job.is_active ? 1 : 0.55 }}>
        <td style={{ fontWeight: 600 }}>{job.name}</td>
        <td>{job.default_price === null ? <span style={{ color: "var(--text-muted)" }}>—</span> : formatRupiah(job.default_price)}</td>
        <td>{job.points}</td>
        <td>
          <AccurateItemCell job={job} canManage={canManage} />
        </td>
        <td style={{ color: "var(--text-muted)" }}>{job.used}×</td>
        <td>{job.is_active ? "Aktif" : "Nonaktif"}</td>
        <td>
          {canManage && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Ubah
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7}>
        <form
          onSubmit={(e) =>
            submit(e, (fd) => updateServiceJobAction(job.id, fd), "Jasa diperbarui.", () => setEditing(false))
          }
          className="flex flex-col gap-3"
          style={{ padding: "0.5rem 0" }}
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1.4fr_0.7fr]">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Nama jasa
              </span>
              <input name="name" defaultValue={job.name} required minLength={2} className="form-input" />
            </label>
            <RupiahInput name="default_price" label="Harga default" defaultValue={job.default_price} />
            <PointsInput defaultValue={job.points} />
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
            Harga dan poin baru berlaku untuk jasa yang dicatat sesudah ini. Yang sudah tercatat tetap
            memakai nilai lamanya, jadi target bulan lalu tidak berubah.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" value="1" defaultChecked={job.is_active} /> Aktif
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              Simpan
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(false)}>
              Batal
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
