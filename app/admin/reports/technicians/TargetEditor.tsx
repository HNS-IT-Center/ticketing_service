"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveTargetAction } from "@/app/actions/targets";
import RupiahInput from "@/components/service/RupiahInput";

type Values = { jobs: number | null; revenue: number | null; points: number | null };

/**
 * Set a monthly target — the shop's default, or one technician's own — from
 * the month on screen onward. Earlier months keep the target they had.
 */
export default function TargetEditor({
  scope,
  month,
  monthText,
  initial,
  buttonLabel,
  canUseDefault = false,
}: {
  /** "default", or a technician's id. */
  scope: string;
  month: string;
  monthText: string;
  initial: Values;
  buttonLabel: string;
  /** A technician with their own target may be sent back to the default. */
  canUseDefault?: boolean;
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
      } catch {
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

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg"
      style={{ background: "var(--cream)", border: "1px solid var(--border-brand)", padding: "0.875rem", minWidth: "16rem" }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Jasa / bulan
          </span>
          <input
            name="jobs"
            type="number"
            min={0}
            defaultValue={initial.jobs ?? ""}
            placeholder="tanpa target"
            className="form-input"
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
        <RupiahInput name="revenue" label="Omzet jasa / bulan" defaultValue={initial.revenue} placeholder="tanpa target" />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Poin / bulan
          </span>
          <input
            name="points"
            type="number"
            min={0}
            defaultValue={initial.points ?? ""}
            placeholder="tanpa target"
            className="form-input"
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
        Berlaku mulai <strong>{monthText}</strong> sampai diubah lagi. Bulan sebelumnya tetap dinilai dengan target lamanya.
        Kosongkan kolom yang tidak ditargetkan.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan target"}
        </button>
        {canUseDefault && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={backToDefault}>
            Pakai target umum
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </form>
  );
}
