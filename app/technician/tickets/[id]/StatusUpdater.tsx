"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import Modal from "@/components/ui/Modal";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

type Status = string;

const TRANSITIONS: Record<string, { label: string; next: string; color: string; danger: boolean }[]> = {
  waiting: [
    { label: "Start Work", next: "on_progress", color: "var(--primary)", danger: false },
  ],
  on_progress: [
    { label: "Mark Done", next: "done", color: "#16a34a", danger: false },
    { label: "Cancel", next: "cancelled", color: "var(--accent)", danger: true },
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
  const [pendingAction, setPendingAction] = useState<{ label: string; next: string; color: string } | null>(null);

  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const actions = TRANSITIONS[currentStatus] ?? [];
  if (actions.length === 0) return null;

  const handleConfirm = () => {
    if (!pendingAction) return;
    const { next } = pendingAction;
    
    if ((next === "cancelled" || next === "rejected") && !reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }

    if ((next === "done" || next === "cancelled" || next === "rejected") && files.length === 0) {
      toast.error("File attachment is required.");
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("newStatus", next);
      if (reason) fd.append("reason", reason);
      files.forEach(f => fd.append("files", f));

      const result = await updateTicketStatusAction(fd);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Status updated to ${next.replace("_", " ")}`);
        setPendingAction(null);
        setReason("");
        setFiles([]);
      }
    });
  };

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {actions.map((a) => (
          <button
            key={a.next}
            onClick={() => setPendingAction(a)}
            disabled={isPending}
            className="btn"
            style={{ background: a.color, color: "#fff", border: "none" }}
          >
            {isPending ? <span className="spinner spinner-sm" /> : a.label}
          </button>
        ))}
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title="Confirm Action"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <div style={{
              width: "2.5rem", height: "2.5rem", borderRadius: "50%",
              background: pendingAction?.next === "cancelled" ? "#fee2e2" : "#dcfce7",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <AlertTriangle
                size={18}
                style={{ color: pendingAction?.next === "cancelled" ? "var(--accent)" : "#16a34a" }}
              />
            </div>
            <div>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                Are you sure you want to mark this ticket as{" "}
                <strong style={{ color: pendingAction?.next === "cancelled" ? "var(--accent)" : "#16a34a" }}>
                  {pendingAction?.label}
                </strong>?
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {pendingAction?.next === "cancelled"
                  ? "This will cancel the ticket. The customer will be notified."
                  : "This will mark the ticket as done and update your performance record."}
              </p>
            </div>
          </div>

          {(pendingAction?.next === "cancelled" || pendingAction?.next === "rejected") && (
            <div className="form-group">
              <label className="form-label">Reason *</label>
              <textarea 
                className="form-input" 
                rows={3} 
                value={reason} 
                onChange={e => setReason(e.target.value)}
                placeholder="Explain why this ticket is being cancelled/rejected..."
              />
            </div>
          )}

          {pendingAction?.next !== "on_progress" && (
            <div className="form-group">
              <label className="form-label">Attachments *</label>
              <FileUpload onChange={setFiles} />
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setPendingAction(null)}>
              Go Back
            </button>
            <button
              className="btn"
              style={{
                background: pendingAction?.color ?? "var(--primary)",
                color: "#fff",
                border: "none",
              }}
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? <><span className="spinner spinner-sm" /> Processing...</> : `Confirm ${pendingAction?.label}`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
