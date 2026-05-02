"use client";

import { useState, useTransition } from "react";
import { takeTicketAction } from "@/app/actions/technician";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

export default function TakeTicketButton({
  ticketId,
  points,
  canTake,
}: {
  ticketId: string;
  points: number;
  canTake: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await takeTicketAction(ticketId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Ticket assigned to you!");
      }
      setOpen(false);
    });
  };

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        disabled={!canTake}
        title={!canTake ? "Workload limit reached" : "Take this ticket"}
      >
        Take Ticket
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Take This Ticket?">
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          Once you take this ticket, you <strong>cannot unassign yourself</strong>. This will add{" "}
          <strong>{points} points</strong> to your workload.
        </p>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Are you sure you want to proceed?
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={isPending}>
            {isPending ? <><span className="spinner spinner-sm" />Assigning...</> : "Yes, Take Ticket"}
          </button>
        </div>
      </Modal>
    </>
  );
}
