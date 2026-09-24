"use client";

import { useState, useTransition } from "react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

type Status = string;

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  waiting: [
    { label: "Approve (On Progress)", next: "on_progress", color: "var(--primary)" },
    { label: "Reject", next: "rejected", color: "var(--accent)" },
  ],
  on_progress: [
    { label: "Mark Done", next: "done", color: "#16a34a" },
    { label: "Cancel", next: "cancelled", color: "var(--accent)" },
  ],
};

export default function AdminStatusPanel({
  ticketId,
  currentStatus,
  ticketType,
}: {
  ticketId: string;
  currentStatus: Status;
  ticketType?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  // A warranty claim leaves `on_progress` only two ways: handed to the RMA desk,
  // or found not eligible. So "Mark Done" here always means the second one, and
  // the server refuses it without a reason — see adminUpdateTicketStatusAction.
  const isClaimInProgress =
    ticketType === "warranty_claim" && currentStatus === "on_progress";

  const actions = (STATUS_ACTIONS[currentStatus] ?? []).map((a) =>
    isClaimInProgress && a.next === "done"
      ? { ...a, label: "Tidak Layak Klaim", color: "#b45309" }
      : a,
  );

  if (actions.length === 0) return null;

  const update = (newStatus: string, withReason?: string) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(
        ticketId,
        newStatus as never,
        withReason,
      );
      if (result?.error) {
        toast.error(result.error as string);
      } else {
        toast.success(`Status → ${newStatus.replace(/_/g, " ")}`);
        setReasonOpen(false);
        setReason("");
      }
    });
  };

  const onClick = (next: string) => {
    if (isClaimInProgress && next === "done") {
      setReasonOpen(true);
      return;
    }
    update(next);
  };

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button
            key={a.next}
            onClick={() => onClick(a.next)}
            disabled={isPending}
            className="btn"
            style={{ background: a.color, color: "#fff", border: "none" }}
          >
            {isPending ? <span className="spinner spinner-sm" /> : a.label}
          </button>
        ))}
      </div>

      <Modal
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title="Tandai Tidak Layak Klaim"
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Tiket akan ditutup sebagai <strong>selesai</strong> dan ditandai tidak memenuhi
            syarat garansi. Alasan ini ditampilkan ke customer di halaman pelacakan, jadi
            tulis dalam kalimat yang bisa mereka pahami.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Kalau unit sebenarnya perlu diklaim ke vendor, jangan pakai tombol ini — serahkan
            ke RMA lewat portal teknisi.
          </p>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Alasan *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              placeholder="Contoh: Kerusakan akibat cairan, di luar cakupan garansi."
              className="form-input"
              style={{ resize: "vertical" }}
            />
          </label>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setReasonOpen(false)}
              disabled={isPending}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "#b45309", color: "#fff", border: "none" }}
              onClick={() => update("done", reason)}
              disabled={isPending || !reason.trim()}
            >
              {isPending ? <span className="spinner spinner-sm" /> : "Tandai Tidak Layak"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
