"use client";

import { requestTicketAssignmentAction } from "@/app/actions/technician";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function TakeTicketButton({ ticketId }: { ticketId: string }) {
  // Errors come back as a value, not a throw: they are toasted and the dialog
  // closes either way, as it always has.
  const confirm = async () => {
    const result = await requestTicketAssignmentAction(ticketId);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Assignment requested successfully!");
    }
  };

  return (
    <ConfirmDialog
      trigger={<Button size="sm" title="Request to work on this ticket" />}
      triggerLabel="Request Ticket"
      title="Request Ticket Assignment?"
      description={
        <>
          You are requesting to be assigned to this ticket. An Admin or Team Leader will review your request.
          <br />
          <br />
          Are you sure you want to proceed?
        </>
      }
      cancelLabel="Cancel"
      confirmLabel="Yes, Request Ticket"
      onConfirm={confirm}
    />
  );
}
