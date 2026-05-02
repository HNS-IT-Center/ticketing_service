"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import toast from "react-hot-toast";

type Status = string;

const TRANSITIONS: Record<string, { label: string; next: string; color: string }[]> = {
  waiting: [{ label: "Start Work", next: "on_progress", color: "var(--primary)" }],
  on_progress: [
    { label: "Mark Done", next: "done", color: "#16a34a" },
    { label: "Cancel", next: "cancelled", color: "var(--accent)" },
  ],
};

export default function StatusUpdater({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: Status;
}) {
  const [isPending, startTransition] = useTransition();
  const actions = TRANSITIONS[currentStatus] ?? [];

  if (actions.length === 0) return null;

  const update = (newStatus: string) => {
    startTransition(async () => {
      const result = await updateTicketStatusAction(ticketId, newStatus as any);
      if (result?.error) toast.error(result.error);
      else toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
    });
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
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
