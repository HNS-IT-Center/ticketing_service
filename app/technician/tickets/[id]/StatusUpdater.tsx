"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import { AlertTriangle, Play, Pause, CheckCircle, XCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
          <Button onClick={() => handleAction("on_progress", "START")} disabled={isPending} className="px-5 py-2.5">
            <Play className="mr-2 h-4 w-4" /> Start Work
          </Button>
        )}

        {currentStatus === "on_progress" && isPaused && (
          <Button onClick={() => setActiveDialog("resume")} disabled={isPending} variant="secondary" className="px-5 py-2.5">
            <Play className="mr-2 h-4 w-4" /> Resume Work
          </Button>
        )}

        {currentStatus === "on_progress" && !isPaused && (
          <>
            <Button onClick={() => setActiveDialog("pause")} disabled={isPending} variant="secondary" className="px-4 py-2.5">
              <Pause className="mr-2 h-4 w-4" /> Pause waiting for Customer
            </Button>
            <Button onClick={() => setActiveDialog("done")} disabled={isPending} style={{ background: "#16a34a", color: "white" }} className="px-5 py-2.5">
              <CheckCircle className="mr-2 h-4 w-4" /> Mark Done
            </Button>
            <Button onClick={() => setActiveDialog("cancel")} disabled={isPending} variant="destructive" className="px-5 py-2.5">
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </Button>
          </>
        )}
      </div>

      {/* PAUSE DIALOG */}
      <Dialog open={activeDialog === "pause"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pause Work</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pause-reason">Reason For Pausing *</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("on_progress", "PAUSE", true)} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Pause"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESUME DIALOG */}
      <Dialog open={activeDialog === "resume"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resume Work</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="resume-reason">Reason For Resuming *</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("on_progress", "RESUME", true)} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Resume"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DONE DIALOG */}
      <Dialog open={activeDialog === "done"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark Ticket as Done</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Proof Attachments *</Label>
              <FileUpload onChange={setFiles} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Go Back</Button>
            <Button style={{ background: "#16a34a", color: "white" }} onClick={() => handleAction("done", "DONE", false, true)} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Mark Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL DIALOG */}
      <Dialog open={activeDialog === "cancel"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} /> Cancel Ticket
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancel-reason">Reason For Cancelling *</Label>
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
              <Label>Attachments (Optional but recommended)</Label>
              <FileUpload onChange={setFiles} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Go Back</Button>
            <Button variant="destructive" onClick={() => handleAction("cancelled", null, true, false)} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
