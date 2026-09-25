"use client";

import { useTransition } from "react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
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

  // A warranty claim leaves `waiting`/`on_progress` one way only: handed to the
  // RMA desk, which is what decides eligibility. The server refuses `done`
  // outright, so the button is not offered — a control whose only outcome is an
  // error is worse than no control.
  const isOpenClaim =
    ticketType === "warranty_claim" &&
    (currentStatus === "waiting" || currentStatus === "on_progress");

  const actions = (STATUS_ACTIONS[currentStatus] ?? []).filter(
    (a) => !(isOpenClaim && a.next === "done"),
  );

  // Removing the button can empty the row. Say why rather than render nothing,
  // or it reads as a page that failed to load.
  if (actions.length === 0) {
    if (!isOpenClaim) return null;
    return (
      <p
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
          margin: 0,
          maxWidth: "26rem",
          textAlign: "right",
        }}
      >
        Tiket klaim garansi diselesaikan lewat tim RMA. Teknisi menyerahkan unit dari portal
        teknisi, lalu tim RMA yang memutuskan kelayakan klaimnya.
      </p>
    );
  }

  const update = (newStatus: string) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, newStatus as never);
      if (result?.error) toast.error(result.error as string);
      else toast.success(`Status → ${newStatus.replace(/_/g, " ")}`);
    });
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {actions.map((a) => (
        <button
          key={a.next}
          onClick={() => update(a.next)}
          disabled={isPending}
          className="btn"
          style={{ background: a.color, color: "#fff", border: "none" }}
        >
          {isPending ? <span className="spinner spinner-sm" /> : a.label}
        </button>
      ))}
    </div>
  );
}
