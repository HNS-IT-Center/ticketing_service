"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import { AlertTriangle, Play, Pause, CheckCircle, XCircle } from "lucide-react";

import Modal from "@/components/ui/Modal";

type Status = string;
type TimeLog = { id: string; event: string; created_at: Date };

const POST_DONE_LABELS: Record<string, string> = {
  done: "✅ Marked as done — awaiting Sales/Admin to complete handover",
  ready_for_pickup: "📦 Ready for pickup — waiting for customer",
  waiting_pickup: "🔔 Customer notified — awaiting pickup",
  handed_to_courier: "🚚 Handed to courier — awaiting delivery confirmation",
  delivered: "📬 Delivered — awaiting completion confirmation",
  completed: "🎉 Ticket completed!",
};

export default function StatusUpdater({
  ticketId,
  currentStatus,
  timeLogs = [],
}: {
  ticketId: string;
  currentStatus: Status;
  timeLogs?: TimeLog[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeDialog, setActiveDialog] = useState<"pause" | "resume" | "done" | "cancel" | null>(null);

  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Time tracking state logic
  const isPaused = timeLogs.length > 0 && timeLogs[timeLogs.length - 1].event === "PAUSE";

  const closeDialog = () => {
    setActiveDialog(null);
    setReason("");
    setFiles([]);
  };

  const handleAction = (nextStatus: string, eventAction: string | null = null, requireReason = false, requireFiles = false) => {
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
        toast.success(`Action successful`);
        closeDialog();
      }
    });
  };

  if (POST_DONE_LABELS[currentStatus]) {
    return (
      <div style={{
        padding: "0.875rem 1rem",
        background: currentStatus === "completed" ? "#f0fdf4" : "#fafafa",
        border: `1px solid ${currentStatus === "completed" ? "#bbf7d0" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        fontSize: "0.875rem",
        color: currentStatus === "completed" ? "#15803d" : "var(--text-secondary)",
        fontWeight: 500,
      }}>
        {POST_DONE_LABELS[currentStatus]}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {currentStatus === "waiting" && (
          <button onClick={() => handleAction("on_progress", "START")} disabled={isPending} className="btn btn-primary px-5 py-2.5">
            <Play className="mr-2 h-4 w-4" /> Start Work
          </button>
        )}

        {currentStatus === "on_progress" && isPaused && (
          <button onClick={() => setActiveDialog("resume")} disabled={isPending} className="btn btn-secondary px-5 py-2.5">
            <Play className="mr-2 h-4 w-4" /> Resume Work
          </button>
        )}

        {currentStatus === "on_progress" && !isPaused && (
          <>
            <button onClick={() => setActiveDialog("pause")} disabled={isPending} className="btn btn-secondary px-4 py-2.5">
              <Pause className="mr-2 h-4 w-4" /> Pause waiting for Customer
            </button>
            <button onClick={() => setActiveDialog("done")} disabled={isPending} style={{ background: "#16a34a", color: "white" }} className="btn px-5 py-2.5">
              <CheckCircle className="mr-2 h-4 w-4" /> Mark Done
            </button>
            <button onClick={() => setActiveDialog("cancel")} disabled={isPending} className="btn" style={{ background: "var(--destructive)", color: "white" }}>
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </button>
          </>
        )}
      </div>

      {/* PAUSE DIALOG */}
      <Modal open={activeDialog === "pause"} onClose={closeDialog} title="Pause Work">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="pause-reason" className="text-sm font-medium">Reason For Pausing *</label>
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn btn-primary" onClick={() => handleAction("on_progress", "PAUSE", true)} disabled={isPending}>
            {isPending ? "Saving..." : "Confirm Pause"}
          </button>
        </div>
      </Modal>

      {/* RESUME DIALOG */}
      <Modal open={activeDialog === "resume"} onClose={closeDialog} title="Resume Work">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="resume-reason" className="text-sm font-medium">Reason For Resuming *</label>
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn btn-primary" onClick={() => handleAction("on_progress", "RESUME", true)} disabled={isPending}>
            {isPending ? "Saving..." : "Confirm Resume"}
          </button>
        </div>
      </Modal>

      {/* DONE DIALOG */}
      <Modal open={activeDialog === "done"} onClose={closeDialog} title="Mark Ticket as Done" maxWidth="560px">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Proof Attachments *</label>
            <FileUpload onChange={setFiles} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn-ghost" onClick={closeDialog}>Go Back</button>
          <button className="btn" style={{ background: "#16a34a", color: "white" }} onClick={() => handleAction("done", "DONE", false, true)} disabled={isPending}>
            {isPending ? "Saving..." : "Confirm Mark Done"}
          </button>
        </div>
      </Modal>

      {/* CANCEL DIALOG */}
      <Modal open={activeDialog === "cancel"} onClose={closeDialog} title="Cancel Ticket" maxWidth="560px">
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason" className="text-sm font-medium text-destructive">Reason For Cancelling *</label>
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
            <label className="text-sm font-medium">Attachments (Optional but recommended)</label>
            <FileUpload onChange={setFiles} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn-ghost" onClick={closeDialog}>Go Back</button>
          <button className="btn" style={{ background: "var(--destructive)", color: "white" }} onClick={() => handleAction("cancelled", null, true, false)} disabled={isPending}>
            {isPending ? "Saving..." : "Confirm Cancellation"}
          </button>
        </div>
      </Modal>
    </>
  );
}
