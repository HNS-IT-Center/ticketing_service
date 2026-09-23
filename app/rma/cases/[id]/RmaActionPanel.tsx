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
      <div className="card">
        <p style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
          <Lock size={16} />
          Hanya tim RMA dan Administrator yang dapat mengubah status case ini.
        </p>
      </div>
    );
  }

  if (isTerminalRmaStatus(currentStatus)) {
    return (
      <div className="card">
        <h3 style={{ margin: "0 0 0.5rem" }}>Aksi</h3>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
          Case sudah {currentStatus === "closed" ? "ditutup" : "dibatalkan"} dan tidak dapat diubah lagi.
        </p>
      </div>
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
    <div className="card">
      <h3 style={{ margin: "0 0 0.35rem" }}>Aksi</h3>
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
        Hanya perpindahan status yang sah untuk kondisi saat ini yang ditampilkan.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {allowed.map((transition) => (
          <button
            key={transition.to}
            type="button"
            onClick={() => {
              setActive(transition);
              setValues({});
            }}
            disabled={isPending}
            className="rma-action-btn"
          >
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{transition.label}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "normal" }}>
                {transition.description}
              </span>
            </span>
            <ArrowRight size={16} style={{ flexShrink: 0, color: "var(--text-muted)", marginTop: "0.15rem" }} />
          </button>
        ))}
      </div>

      <Modal open={active !== null} onClose={close} title={active?.label ?? ""} maxWidth="560px">
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ background: "var(--cream)", borderRadius: "var(--radius-md)", padding: "0.75rem 1rem", fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
              {active.description}
            </p>

            {requiredFields.map((field) =>
              field === "decision" ? (
                <div key={field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <label htmlFor={`rma-${field}`} style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {FIELD_INPUTS[field].label} <span style={{ color: "var(--accent)" }}>*</span>
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
                <div key={field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <label htmlFor={`rma-${field}`} style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {FIELD_INPUTS[field].label} <span style={{ color: "var(--accent)" }}>*</span>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <label htmlFor="rma-tracking" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  Resi Pengiriman <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional)</span>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <label htmlFor="rma-decision-notes" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  Catatan Keputusan <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional)</span>
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

            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label htmlFor="rma-note" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                Catatan Internal <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional)</span>
              </label>
              <input
                id="rma-note"
                className="form-input"
                value={values.note ?? ""}
                onChange={(e) => setValue("note", e.target.value)}
                placeholder="Tercatat pada riwayat RMA"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
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
    </div>
  );
}
