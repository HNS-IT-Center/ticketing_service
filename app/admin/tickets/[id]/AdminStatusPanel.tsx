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
}: {
  ticketId: string;
  currentStatus: Status;
}) {
  const [isPending, startTransition] = useTransition();
  const actions = STATUS_ACTIONS[currentStatus] ?? [];

  if (actions.length === 0) return null;

  const update = (newStatus: string) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, newStatus as any);
      if (result?.error) toast.error(result.error as string);
      else toast.success(`Status → ${newStatus.replace("_", " ")}`);
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
