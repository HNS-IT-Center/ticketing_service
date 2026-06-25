"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import {
  Play, Pause, CheckCircle, XCircle,
  PackageCheck, Truck, ArrowRight, HandshakeIcon,
} from "lucide-react";
import Modal from "@/components/ui/Modal";

type Status = string;
type TimeLog = { id?: string; event: string; created_at: Date | string };

// ── Proof step card shown in handover dialogs ─────────────────────────────
function ProofStepInfo({
  step,
  total,
  icon,
  title,
  description,
}: {
  step: number;
  total: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        padding: "0.875rem 1rem",
        background: "linear-gradient(135deg, rgba(22,70,157,0.04) 0%, rgba(22,70,157,0.01) 100%)",
        border: "1px solid rgba(22,70,157,0.12)",
        borderRadius: "var(--radius-md)",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          width: "2.25rem",
          height: "2.25rem",
          borderRadius: "50%",
          background: "var(--primary-brand, #16469d)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
          Step {step} of {total}
        </div>
        <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.2rem" }}>
          {title}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

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
    | "pause" | "resume" | "done"
    | "cancel"
    | "ready_confirm"
    | "pickup_proof"     // self-pickup: proof of handing item to customer
    | "courier_proof"    // courier: proof of handing package to courier
    | "delivery_proof"   // courier: proof from courier that item was delivered
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const isPaused =
    timeLogs.length > 0 &&
    timeLogs[timeLogs.length - 1].event === "PAUSE";

  const closeDialog = () => {
    setActiveDialog(null);
    setReason("");
    setFiles([]);
  };

  // Generic action dispatcher
  const handleAction = (
    nextStatus: string,
    eventAction: string | null = null,
    opts: { requireReason?: boolean; requireFiles?: boolean } = {}
  ) => {
    if (opts.requireReason && !reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    if (opts.requireFiles && files.filter((f) => f.size > 0).length === 0) {
      toast.error("Please attach at least one proof file.");
      return;
    }

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("ticketId", ticketId);
        fd.append("newStatus", nextStatus);
        if (eventAction) fd.append("eventAction", eventAction);
        if (reason) fd.append("reason", reason);
        files.forEach((f) => fd.append("files", f));

        const result = await updateTicketStatusAction(fd);
        if (result?.error) toast.error(result.error);
        else {
          toast.success("Status updated!");
          closeDialog();
        }
      } catch (err: any) {
        console.error("Action error:", err);
        if (err.message?.includes("Unexpected end of form") || err.message?.includes("Body exceeded")) {
          toast.error("Upload failed: File size is too large. Please limit to 10MB.");
        } else {
          toast.error("An unexpected error occurred. Please try again.");
        }
      }
    });
  };

  // ── Status label map ───────────────────────────────────────────────────────
  const statusLabels: Record<string, { emoji: string; text: string; color: string; bg: string; border: string }> = {
    done:              { emoji: "✅", text: "Work done — proceed with handover below", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
    ready_for_pickup:  { emoji: "📦", text: "Item ready at counter — upload pickup handover proof", color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" },
    handed_to_courier: { emoji: "🚚", text: "Package handed to courier — waiting for delivery confirmation", color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" },
    delivered:         { emoji: "📬", text: "Delivered — upload delivery proof to auto-complete", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
    completed:         { emoji: "🎉", text: "Ticket fully completed!", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  };

  // ── Handover section (post-done statuses) ─────────────────────────────────
  const handoverStatuses = ["done", "ready_for_pickup", "handed_to_courier", "delivered", "completed"];
  const isInHandover = handoverStatuses.includes(currentStatus);

  if (isInHandover) {
    const info = statusLabels[currentStatus];

    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
          {/* Status label */}
          <div
            style={{
              padding: "0.75rem 1rem",
              background: info?.bg ?? "#f8fafc",
              border: `1px solid ${info?.border ?? "var(--border)"}`,
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color: info?.color ?? "var(--text-secondary)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>{info?.emoji}</span>
            {info?.text ?? currentStatus.replace(/_/g, " ")}
          </div>

          {/* ── Self-pickup path ── */}
          {currentStatus === "done" && pickupMethod !== "courier" && (
            <button
              onClick={() => setActiveDialog("ready_confirm")}
              disabled={isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1.1rem",
                borderRadius: "var(--radius-md)",
                background: "#0891b2", color: "white",
                border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: "0.875rem",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <PackageCheck size={16} /> Mark as Ready for Pickup
            </button>
          )}

          {currentStatus === "ready_for_pickup" && (
            <button
              onClick={() => setActiveDialog("pickup_proof")}
              disabled={isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1.1rem",
                borderRadius: "var(--radius-md)",
                background: "#16a34a", color: "white",
                border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: "0.875rem",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <CheckCircle size={16} /> Item Picked Up by Customer
            </button>
          )}

          {/* ── Courier path ── */}
          {currentStatus === "done" && pickupMethod === "courier" && (
            <button
              onClick={() => setActiveDialog("courier_proof")}
              disabled={isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1.1rem",
                borderRadius: "var(--radius-md)",
                background: "#7c3aed", color: "white",
                border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: "0.875rem",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <Truck size={16} /> Proceed to Delivery
            </button>
          )}

          {currentStatus === "handed_to_courier" && (
            <button
              onClick={() => setActiveDialog("delivery_proof")}
              disabled={isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1.1rem",
                borderRadius: "var(--radius-md)",
                background: "#16a34a", color: "white",
                border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: "0.875rem",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <PackageCheck size={16} /> Confirm Delivered
            </button>
          )}
        </div>

        {/* ── READY FOR PICKUP CONFIRM (no proof needed) ── */}
        <Modal
          open={activeDialog === "ready_confirm"}
          onClose={closeDialog}
          title="Mark as Ready for Pickup"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.25rem 0" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Confirm that the item is ready at the counter for customer pickup. The customer will be notified.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => handleAction("ready_for_pickup")}
                disabled={isPending}
              >
                {isPending ? "Updating..." : "Confirm Ready"}
              </button>
            </div>
          </div>
        </Modal>

        {/* ── PICKUP PROOF — self-pickup: handover to customer ── */}
        <Modal
          open={activeDialog === "pickup_proof"}
          onClose={closeDialog}
          title="Pickup Handover Proof"
          maxWidth="540px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ProofStepInfo
              step={2}
              total={2}
              icon={<HandshakeIcon size={16} />}
              title="Upload Handover Proof"
              description="Take a photo of handing the item to the customer. This completes the ticket automatically."
            />
            <div>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                Proof Photo / File <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <FileUpload onChange={setFiles} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button
                className="btn"
                style={{ background: "#16a34a", color: "white" }}
                onClick={() => handleAction("completed", null, { requireFiles: true })}
                disabled={isPending}
              >
                {isPending ? "Uploading..." : "Confirm Handover & Complete"}
              </button>
            </div>
          </div>
        </Modal>

        {/* ── COURIER PROOF — handover package to courier ── */}
        <Modal
          open={activeDialog === "courier_proof"}
          onClose={closeDialog}
          title="Proceed to Delivery"
          maxWidth="540px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ProofStepInfo
              step={1}
              total={2}
              icon={<Truck size={16} />}
              title="Upload Courier Handover Proof"
              description="Take a photo of handing the package to the courier / delivery service. Status will change to 'On Delivery'."
            />
            <div>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                Courier Handover Photo <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <FileUpload onChange={setFiles} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button
                className="btn"
                style={{ background: "#7c3aed", color: "white" }}
                onClick={() => handleAction("handed_to_courier", null, { requireFiles: true })}
                disabled={isPending}
              >
                {isPending ? "Uploading..." : "Confirm Handover to Courier"}
              </button>
            </div>
          </div>
        </Modal>

        {/* ── DELIVERY PROOF — receipt/photo from courier ── */}
        <Modal
          open={activeDialog === "delivery_proof"}
          onClose={closeDialog}
          title="Confirm Delivery"
          maxWidth="540px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ProofStepInfo
              step={2}
              total={2}
              icon={<PackageCheck size={16} />}
              title="Upload Delivery Confirmation"
              description="Upload the proof from the courier that the item has been delivered to the recipient (e.g. delivery receipt, courier app screenshot). This auto-completes the ticket."
            />
            <div>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                Delivery Proof <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <FileUpload onChange={setFiles} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button
                className="btn"
                style={{ background: "#16a34a", color: "white" }}
                onClick={() => handleAction("delivered", null, { requireFiles: true })}
                disabled={isPending}
              >
                {isPending ? "Uploading..." : "Confirm Delivered & Complete"}
              </button>
            </div>
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
              <Pause className="mr-2 h-4 w-4" /> Pause
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

      {/* ── PAUSE DIALOG — requires reason ── */}
      <Modal open={activeDialog === "pause"} onClose={closeDialog} title="Pause Work">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.25rem 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="pause-reason" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Reason for Pausing <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <textarea
              id="pause-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Waiting for customer to approve part replacement..."
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => handleAction("on_progress", "PAUSE", { requireReason: true })}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Confirm Pause"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── RESUME DIALOG — no reason needed, just confirm ── */}
      <Modal open={activeDialog === "resume"} onClose={closeDialog} title="Resume Work">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.25rem 0" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
            Ready to continue working on this ticket?
          </p>
          <div
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color: "#1d4ed8",
            }}
          >
            <ArrowRight size={16} />
            Work timer will resume from where it left off.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => handleAction("on_progress", "RESUME")}
              disabled={isPending}
            >
              {isPending ? "Resuming..." : "Resume Work"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── DONE DIALOG — requires proof files ── */}
      <Modal
        open={activeDialog === "done"}
        onClose={closeDialog}
        title="Mark Work as Done"
        maxWidth="560px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <ProofStepInfo
            step={1}
            total={pickupMethod === "courier" ? 3 : 2}
            icon={<CheckCircle size={16} />}
            title="Upload Proof of Finished Work"
            description="Attach photos or videos showing the completed repair/service. This stops your working timer."
          />
          <div>
            <label style={{ fontSize: "0.875rem", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
              Work Completion Proof <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <FileUpload onChange={setFiles} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={closeDialog}>Go Back</button>
            <button
              className="btn"
              style={{ background: "#16a34a", color: "white" }}
              onClick={() => handleAction("done", "DONE", { requireFiles: true })}
              disabled={isPending}
            >
              {isPending ? "Uploading..." : "Confirm Work Done"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── CANCEL DIALOG ── */}
      <Modal
        open={activeDialog === "cancel"}
        onClose={closeDialog}
        title="Cancel Ticket"
        maxWidth="560px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="cancel-reason" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--destructive)" }}>
              Reason for Cancelling <span style={{ color: "var(--accent)" }}>*</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Attachments <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <FileUpload onChange={setFiles} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={closeDialog}>Go Back</button>
            <button
              className="btn"
              style={{ background: "var(--destructive)", color: "white" }}
              onClick={() => handleAction("cancelled", null, { requireReason: true })}
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
