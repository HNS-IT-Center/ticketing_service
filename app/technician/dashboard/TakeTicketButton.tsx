"use client";

import { useState, useTransition } from "react";
import { requestTicketAssignmentAction } from "@/app/actions/technician";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

export default function TakeTicketButton({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await requestTicketAssignmentAction(ticketId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Assignment requested successfully!");
      }
      setOpen(false);
    });
  };

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
        title="Request to work on this ticket"
      >
        Request Ticket
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Request Ticket Assignment?">
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          You are requesting to be assigned to this ticket. An Admin or Team Leader will review your request.
        </p>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Are you sure you want to proceed?
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={isPending}>
            {isPending ? <><span className="spinner spinner-sm" />Requesting...</> : "Yes, Request Ticket"}
          </button>
        </div>
      </Modal>
    </>
  );
}
