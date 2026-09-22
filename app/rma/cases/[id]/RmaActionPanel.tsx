"use client";

import { useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import type { RmaStatus } from "@prisma/client";
import Modal from "@/components/ui/Modal";
import { transitionRmaAction } from "@/app/actions/rma";
import {
  canActOnRma,
  getAllowedTransitions,
  isTerminalRmaStatus,
  validateRmaTransition,
  type RmaTransition,
  type RmaTransitionField,
} from "@/lib/rma/state-machine";
import { Lock, ArrowRight } from "lucide-react";

/**
 * Every button here is derived from lib/rma/state-machine.ts — the same module
 * the server validates against — so the panel can never offer a move the action
 * would refuse. Nothing about the transitions is written out a second time.
 */

const FIELD_INPUTS: Record<
  RmaTransitionField,
  { label: string; placeholder: string; multiline?: boolean }
> = {
  hold_reason: { label: "Alasan", placeholder: "Jelaskan apa yang kurang atau menghambat", multiline: true },
  vendor_name: { label: "Nama Vendor", placeholder: "Misal: Asus Service Center" },
  vendor_rma_number: { label: "Nomor RMA Vendor", placeholder: "Nomor dari vendor" },
  decision: { label: "Keputusan Vendor", placeholder: "" },
  replacement_sn: { label: "Serial Number Pengganti", placeholder: "SN unit pengganti" },
};

/** Fields that are useful on a transition without being required by it. */
type OptionalField = "shipping_tracking" | "decision_notes";

const OPTIONAL_FIELDS: Partial<Record<RmaStatus, readonly OptionalField[]>> = {
  submitted_to_vendor: ["shipping_tracking"],
  in_vendor_process: ["shipping_tracking"],
  vendor_decided: ["decision_notes"],
};

const DECISION_OPTIONS = [
  { value: "repaired", label: "Diperbaiki" },
  { value: "replaced", label: "Diganti unit baru" },
  { value: "refund", label: "Dana dikembalikan" },
  { value: "rejected", label: "Ditolak vendor" },
];

export default function RmaActionPanel({
  rmaCaseId,
  currentStatus,
  role,
}: {
  rmaCaseId: string;
  currentStatus: RmaStatus;
  role: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState<RmaTransition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  // Status AND role both gate the buttons, matching the server's own checks.
  const allowed = useMemo(
    () => (canActOnRma(role) ? getAllowedTransitions(currentStatus) : []),
    [currentStatus, role]
  );

  const close = () => {
    setActive(null);
    setValues({});
  };

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!active) return;

    // Validate with the very same function the server uses, so the dialog can
    // name the missing field before a round trip.
    const check = validateRmaTransition({
      role,
      from: currentStatus,
      to: active.to,
      input: values,
    });
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.append("rmaCaseId", rmaCaseId);
      fd.append("toStatus", active.to);
      for (const [key, value] of Object.entries(values)) {
        if (value.trim()) fd.append(key, value.trim());
      }

      const result = await transitionRmaAction(fd);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Status diperbarui: ${active.label}`);
      close();
    });
  };

  if (!canActOnRma(role)) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Lock className="h-4 w-4" />
          Hanya tim RMA dan Administrator yang dapat mengubah status case ini.
        </p>
      </section>
    );
  }

  if (isTerminalRmaStatus(currentStatus)) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-base font-bold text-slate-900">Aksi</h3>
        <p className="text-sm text-slate-500">
          Case sudah {currentStatus === "closed" ? "ditutup" : "dibatalkan"} dan tidak dapat diubah lagi.
        </p>
      </section>
    );
  }

  const requiredFields: RmaTransitionField[] = active
    ? [
        ...active.requires,
        ...(active.to === "vendor_decided" && values.decision === "replaced"
          ? (["replacement_sn"] as RmaTransitionField[])
          : []),
      ]
    : [];

  const optionalFields: readonly OptionalField[] = active
    ? (OPTIONAL_FIELDS[active.to] ?? [])
    : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-1 text-base font-bold text-slate-900">Aksi</h3>
      <p className="mb-4 text-xs text-slate-500">
        Hanya perpindahan status yang sah untuk kondisi saat ini yang ditampilkan.
      </p>

      <div className="flex flex-col gap-2">
        {allowed.map((transition) => (
          <button
            key={transition.to}
            type="button"
            onClick={() => {
              setActive(transition);
              setValues({});
            }}
            disabled={isPending}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-900">{transition.label}</span>
              <span className="text-xs text-slate-500">{transition.description}</span>
            </span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
      </div>

      <Modal open={active !== null} onClose={close} title={active?.label ?? ""} maxWidth="560px">
        {active && (
          <div className="flex flex-col gap-4">
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {active.description}
            </p>

            {requiredFields.map((field) =>
              field === "decision" ? (
                <div key={field} className="flex flex-col gap-1.5">
                  <label htmlFor={`rma-${field}`} className="text-sm font-semibold text-slate-800">
                    {FIELD_INPUTS[field].label} <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id={`rma-${field}`}
                    className="form-input"
                    value={values[field] ?? ""}
                    onChange={(e) => setValue(field, e.target.value)}
                  >
                    <option value="">Pilih keputusan</option>
                    {DECISION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div key={field} className="flex flex-col gap-1.5">
                  <label htmlFor={`rma-${field}`} className="text-sm font-semibold text-slate-800">
                    {FIELD_INPUTS[field].label} <span className="text-rose-600">*</span>
                  </label>
                  {FIELD_INPUTS[field].multiline ? (
                    <textarea
                      id={`rma-${field}`}
                      className="form-input"
                      rows={3}
                      value={values[field] ?? ""}
                      onChange={(e) => setValue(field, e.target.value)}
                      placeholder={FIELD_INPUTS[field].placeholder}
                    />
                  ) : (
                    <input
                      id={`rma-${field}`}
                      className="form-input"
                      value={values[field] ?? ""}
                      onChange={(e) => setValue(field, e.target.value)}
                      placeholder={FIELD_INPUTS[field].placeholder}
                    />
                  )}
                </div>
              )
            )}

            {optionalFields.includes("shipping_tracking") && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rma-tracking" className="text-sm font-semibold text-slate-800">
                  Resi Pengiriman <span className="font-normal text-slate-500">(opsional)</span>
                </label>
                <input
                  id="rma-tracking"
                  className="form-input"
                  value={values.shipping_tracking ?? ""}
                  onChange={(e) => setValue("shipping_tracking", e.target.value)}
                  placeholder="Nomor resi"
                />
              </div>
            )}

            {optionalFields.includes("decision_notes") && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rma-decision-notes" className="text-sm font-semibold text-slate-800">
                  Catatan Keputusan <span className="font-normal text-slate-500">(opsional)</span>
                </label>
                <textarea
                  id="rma-decision-notes"
                  className="form-input"
                  rows={2}
                  value={values.decision_notes ?? ""}
                  onChange={(e) => setValue("decision_notes", e.target.value)}
                  placeholder="Keterangan tambahan dari vendor"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="rma-note" className="text-sm font-semibold text-slate-800">
                Catatan Internal <span className="font-normal text-slate-500">(opsional)</span>
              </label>
              <input
                id="rma-note"
                className="form-input"
                value={values.note ?? ""}
                onChange={(e) => setValue("note", e.target.value)}
                placeholder="Tercatat pada riwayat RMA"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={close} disabled={isPending}>
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={isPending}
              >
                {isPending ? "Menyimpan..." : active.label}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
