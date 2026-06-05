"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import { Play, Pause, CheckCircle, XCircle, PackageCheck, Truck, Bell, Star } from "lucide-react";
import Modal from "@/components/ui/Modal";

type Status = string;
type TimeLog = { id: string; event: string; created_at: Date };

export default function StatusUpdater({
  ticketId,
  currentStatus,
  timeLogs = [],
  pickupMethod = "self_pickup",
}: {
  ticketId: string;
  currentStatus: Status;
  timeLogs?: TimeLog[];
  pickupMethod?: "self_pickup" | "courier" | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeDialog, setActiveDialog] = useState<
    "pause" | "resume" | "done" | "cancel" | "handover_confirm" | null
  >(null);
  const [pendingHandover, setPendingHandover] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const isPaused =
    timeLogs.length > 0 && timeLogs[timeLogs.length - 1].event === "PAUSE";

  const closeDialog = () => {
    setActiveDialog(null);
    setReason("");
    setFiles([]);
    setPendingHandover(null);
  };

  const handleAction = (
    nextStatus: string,
    eventAction: string | null = null,
    requireReason = false,
    requireFiles = false
  ) => {
    if (requireReason && !reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    if (requireFiles && files.length === 0) {
      toast.error("File attachment is required.");
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("newStatus", nextStatus);
      if (eventAction) fd.append("eventAction", eventAction);
      if (reason) fd.append("reason", reason);
      files.forEach((f) => fd.append("files", f));

      const result = await updateTicketStatusAction(fd);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Status updated successfully");
        closeDialog();
      }
    });
  };

  const confirmHandover = (nextStatus: string) => {
    setPendingHandover(nextStatus);
    setActiveDialog("handover_confirm");
  };

  // ── Handover flow after Done ──────────────────────────────────────────────
  const HANDOVER_STEP: Record<
    string,
    { label: string; nextStatus: string; icon: React.ReactNode; color: string }[]
  > = {
    done:
      pickupMethod === "courier"
        ? [
            {
              label: "Hand to Courier",
              nextStatus: "handed_to_courier",
              icon: <Truck size={15} />,
              color: "#7c3aed",
            },
          ]
        : [
            {
              label: "Ready for Pickup",
              nextStatus: "ready_for_pickup",
              icon: <PackageCheck size={15} />,
              color: "#0891b2",
            },
          ],
    ready_for_pickup: [
      {
        label: "Notify Customer (Waiting Pickup)",
        nextStatus: "waiting_pickup",
        icon: <Bell size={15} />,
        color: "#ca8a04",
      },
    ],
    waiting_pickup: [
      {
        label: "Mark Completed",
        nextStatus: "completed",
        icon: <Star size={15} />,
        color: "#16a34a",
      },
    ],
    handed_to_courier: [
      {
        label: "Mark Delivered",
        nextStatus: "delivered",
        icon: <PackageCheck size={15} />,
        color: "#7c3aed",
      },
    ],
    delivered: [
      {
        label: "Mark Completed",
        nextStatus: "completed",
        icon: <Star size={15} />,
        color: "#16a34a",
      },
    ],
  };

  const handoverSteps = HANDOVER_STEP[currentStatus];

  // ── Post-done / handover view ─────────────────────────────────────────────
  if (handoverSteps || currentStatus === "completed") {
    const statusLabels: Record<string, string> = {
      done: "✅ Work done — proceed with handover below",
      ready_for_pickup: "📦 Item ready at counter — notify customer",
      waiting_pickup: "🔔 Customer notified — waiting for pickup",
      handed_to_courier: "🚚 Handed to courier — awaiting delivery confirmation",
      delivered: "📬 Delivered — confirm completion",
      completed: "🎉 Ticket fully completed!",
    };

    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Current step label */}
          <div
            style={{
              padding: "0.75rem 1rem",
              background: currentStatus === "completed" ? "#f0fdf4" : "#fafafa",
              border: `1px solid ${
                currentStatus === "completed" ? "#bbf7d0" : "var(--border)"
              }`,
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color:
                currentStatus === "completed" ? "#15803d" : "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            {statusLabels[currentStatus] ?? currentStatus}
          </div>

          {/* Next-step buttons */}
          {handoverSteps && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {handoverSteps.map((step) => (
                <button
                  key={step.nextStatus}
                  onClick={() => confirmHandover(step.nextStatus)}
                  disabled={isPending}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius-md)",
                    background: step.color,
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    opacity: isPending ? 0.6 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {step.icon} {step.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* HANDOVER CONFIRM DIALOG */}
        <Modal
          open={activeDialog === "handover_confirm"}
          onClose={closeDialog}
          title="Confirm Handover Step"
        >
          <div className="grid gap-4 py-4">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Are you sure you want to advance this ticket to{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {pendingHandover?.replace(/_/g, " ").toUpperCase()}
              </strong>
              ?
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              This action will update the ticket status and notify the customer.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              marginTop: "1rem",
            }}
          >
            <button className="btn btn-ghost" onClick={closeDialog}>
              Go Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => pendingHandover && handleAction(pendingHandover)}
              disabled={isPending}
            >
              {isPending ? "Updating..." : "Confirm"}
            </button>
          </div>
        </Modal>
      </>
    );
  }

  // ── Default work-in-progress view ─────────────────────────────────────────
  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {currentStatus === "waiting" && (
          <button
            onClick={() => handleAction("on_progress", "START")}
            disabled={isPending}
            className="btn btn-primary px-5 py-2.5"
          >
            <Play className="mr-2 h-4 w-4" /> Start Work
          </button>
        )}

        {currentStatus === "on_progress" && isPaused && (
          <button
            onClick={() => setActiveDialog("resume")}
            disabled={isPending}
            className="btn btn-secondary px-5 py-2.5"
          >
            <Play className="mr-2 h-4 w-4" /> Resume Work
          </button>
        )}

        {currentStatus === "on_progress" && !isPaused && (
          <>
            <button
              onClick={() => setActiveDialog("pause")}
              disabled={isPending}
              className="btn btn-secondary px-4 py-2.5"
            >
              <Pause className="mr-2 h-4 w-4" /> Pause waiting for Customer
            </button>
            <button
              onClick={() => setActiveDialog("done")}
              disabled={isPending}
              style={{ background: "#16a34a", color: "white" }}
              className="btn px-5 py-2.5"
            >
              <CheckCircle className="mr-2 h-4 w-4" /> Mark Done
            </button>
            <button
              onClick={() => setActiveDialog("cancel")}
              disabled={isPending}
              className="btn"
              style={{ background: "var(--destructive)", color: "white" }}
            >
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </button>
          </>
        )}
      </div>

      {/* PAUSE DIALOG */}
      <Modal open={activeDialog === "pause"} onClose={closeDialog} title="Pause Work">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="pause-reason" className="text-sm font-medium">
              Reason For Pausing *
            </label>
            <textarea
              id="pause-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you pausing work? (e.g., Waiting for customer approval...)"
            />
          </div>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}
        >
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleAction("on_progress", "PAUSE", true)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Confirm Pause"}
          </button>
        </div>
      </Modal>

      {/* RESUME DIALOG */}
      <Modal open={activeDialog === "resume"} onClose={closeDialog} title="Resume Work">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="resume-reason" className="text-sm font-medium">
              Reason For Resuming *
            </label>
            <textarea
              id="resume-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you resuming work? (e.g., Customer approved part replacement...)"
            />
          </div>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}
        >
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleAction("on_progress", "RESUME", true)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Confirm Resume"}
          </button>
        </div>
      </Modal>

      {/* DONE DIALOG */}
      <Modal
        open={activeDialog === "done"}
        onClose={closeDialog}
        title="Mark Ticket as Done"
        maxWidth="560px"
      >
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Proof Attachments *</label>
            <FileUpload onChange={setFiles} />
          </div>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}
        >
          <button className="btn btn-ghost" onClick={closeDialog}>
            Go Back
          </button>
          <button
            className="btn"
            style={{ background: "#16a34a", color: "white" }}
            onClick={() => handleAction("done", "DONE", false, true)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Confirm Mark Done"}
          </button>
        </div>
      </Modal>

      {/* CANCEL DIALOG */}
      <Modal
        open={activeDialog === "cancel"}
        onClose={closeDialog}
        title="Cancel Ticket"
        maxWidth="560px"
      >
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason" className="text-sm font-medium text-destructive">
              Reason For Cancelling *
            </label>
            <textarea
              id="cancel-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this ticket is being cancelled..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Attachments (Optional but recommended)
            </label>
            <FileUpload onChange={setFiles} />
          </div>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}
        >
          <button className="btn btn-ghost" onClick={closeDialog}>
            Go Back
          </button>
          <button
            className="btn"
            style={{ background: "var(--destructive)", color: "white" }}
            onClick={() => handleAction("cancelled", null, true, false)}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Confirm Cancellation"}
          </button>
        </div>
      </Modal>
    </>
  );
}
