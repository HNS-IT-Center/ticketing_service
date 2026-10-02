"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import { handoverToRmaAction } from "@/app/actions/rma";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import {
  Play, Pause, CheckCircle, XCircle,
  PackageCheck, Truck, ArrowRight, HandshakeIcon,
  ShieldCheck, FileText,
} from "lucide-react";
import Modal from "@/components/ui/Modal";

/** Matches MAX_DAMAGE_PHOTOS in app/actions/rma.ts. */
const MAX_DAMAGE_PHOTOS = 5;

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
  isSalesMode = false,
  ticketType = "service",
  attachments = [],
}: {
  ticketId: string;
  currentStatus: Status;
  timeLogs?: TimeLog[];
  pickupMethod?: "self_pickup" | "courier" | null;
  isSalesMode?: boolean;
  ticketType?: string;
  /** Existing ticket attachments, so the handover form can reuse the intake invoice. */
  attachments?: { id: string; file_url: string; file_type: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeDialog, setActiveDialog] = useState<
    | "pause" | "resume" | "done"
    | "cancel"
    | "ready_confirm"
    | "pickup_proof"     // self-pickup: proof of handing item to customer
    | "courier_proof"    // courier: proof of handing package to courier
    | "delivery_proof"   // courier: proof from courier that item was delivered
    | "rma_handover"     // warranty claim: service form before handing to the RMA desk
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // ── Warranty claim: RMA service form ──
  const isWarrantyClaim = ticketType === "warranty_claim";
  const [unitOwnership, setUnitOwnership] = useState<"customer" | "store_stock">("customer");
  const [stockOrigin, setStockOrigin] = useState("");
  const [snVerified, setSnVerified] = useState(false);
  const [physicalCondition, setPhysicalCondition] = useState("");
  const [faultDescription, setFaultDescription] = useState("");
  const [testResult, setTestResult] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  // Evidence and advice the RMA desk needs to rule on the claim.
  const [damagePhotos, setDamagePhotos] = useState<File[]>([]);
  const [recommendEligible, setRecommendEligible] = useState<"" | "yes" | "no">("");
  const [recommendNote, setRecommendNote] = useState("");

  /**
   * Client-side copy of the server's handover rules.
   *
   * The wording is the server's, word for word, so a technician never sees two
   * different sentences for the same rule. The server still enforces all of it
   * — this only saves a round trip.
   */
  const handoverError = (): string | null => {
    const photos = damagePhotos.filter((f) => f.size > 0);
    if (photos.length === 0) {
      return "Minimal satu foto atau video kondisi/kerusakan unit wajib dilampirkan.";
    }
    if (photos.length > MAX_DAMAGE_PHOTOS) {
      return `Maksimal ${MAX_DAMAGE_PHOTOS} berkas bukti kerusakan.`;
    }
    const bad = photos.find(
      (f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"),
    );
    if (bad) return `Bukti kerusakan harus berupa gambar atau video. "${bad.name}" bukan keduanya.`;

    if (recommendEligible !== "yes" && recommendEligible !== "no") {
      return "Rekomendasi teknisi (layak / tidak layak) wajib dipilih.";
    }
    if (recommendEligible === "no" && !recommendNote.trim()) {
      return "Catatan wajib diisi bila rekomendasi teknisi adalah tidak layak.";
    }
    return null;
  };

  const handleHandover = () => {
    const problem = handoverError();
    if (problem) {
      toast.error(problem);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("unit_ownership", unitOwnership);
      if (snVerified) fd.append("sn_verified", "1");
      fd.append("physical_condition", physicalCondition);
      fd.append("fault_description", faultDescription);
      fd.append("test_result", testResult);
      if (unitOwnership === "store_stock") fd.append("stock_origin", stockOrigin);
      if (unitOwnership === "customer" && invoiceUrl) fd.append("purchase_invoice_url", invoiceUrl);
      files.forEach((f) => fd.append("invoice_files", f));
      damagePhotos
        .filter((f) => f.size > 0)
        .forEach((f) => fd.append("damage_files", f));
      fd.append("recommended_eligible", recommendEligible);
      if (recommendNote.trim()) fd.append("recommendation_note", recommendNote.trim());

      const result = await handoverToRmaAction(fd);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "rmaCode" in result && result.rmaCode
          ? `Unit diserahkan ke RMA — ${result.rmaCode}`
          : "Unit diserahkan ke RMA"
      );
      closeDialog();
    });
  };

  const isPaused =
    timeLogs.length > 0 &&
    timeLogs[timeLogs.length - 1].event === "PAUSE";

  const closeDialog = () => {
    setActiveDialog(null);
    setDamagePhotos([]);
    setRecommendEligible("");
    setRecommendNote("");
    setReason("");
    setFiles([]);
  };

  // Generic action dispatcher
  const handleAction = (
    nextStatus: string,
    eventAction: string | null = null,
    opts: { requireReason?: boolean; requireFiles?: boolean } = {}
  ) => {
    let finalReason = reason.trim();
    if (eventAction === "PAUSE" && !finalReason) {
      finalReason = "On Break";
    }

    if (opts.requireReason && !finalReason) {
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
        if (finalReason) fd.append("reason", finalReason);
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

          {/* Role Check for Handover */}
          {(ticketType === "pc_build" ? isSalesMode : !isSalesMode) ? (
            <>
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
            </>
          ) : (
            <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
              {ticketType === "pc_build" 
                ? "Waiting for Sales to manage handover." 
                : "Waiting for Technician to manage handover."}
            </div>
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
  if (isSalesMode) return null;
  
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
            {isWarrantyClaim ? (
              <>
                <button
                  onClick={() => setActiveDialog("rma_handover")}
                  disabled={isPending}
                  style={{ background: "#16469d", color: "white" }}
                  className="btn px-5 py-2.5"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Serahkan ke RMA
                </button>
              </>
            ) : (
              <button
                onClick={() => setActiveDialog("done")}
                disabled={isPending}
                style={{ background: "#16a34a", color: "white" }}
                className="btn px-5 py-2.5"
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Mark Done
              </button>
            )}
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
              Reason for Pausing <span style={{ color: "var(--accent-brand)" }}>*</span>
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
              Reason for Cancelling <span style={{ color: "var(--accent-brand)" }}>*</span>
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

      {/* Warranty claim: service form before handing the unit to the RMA desk */}
      <Modal
        open={activeDialog === "rma_handover"}
        onClose={closeDialog}
        title="Serahkan Unit ke RMA"
        maxWidth="640px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <ProofStepInfo
            step={1}
            total={1}
            icon={<ShieldCheck size={18} />}
            title="Service Form"
            description="Isi hasil pemeriksaan unit. Data ini yang diverifikasi tim RMA sebelum klaim diajukan ke vendor."
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Kepemilikan Unit <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <select
              className="form-input"
              value={unitOwnership}
              onChange={(e) => setUnitOwnership(e.target.value as "customer" | "store_stock")}
            >
              <option value="customer">Milik Customer</option>
              <option value="store_stock">Stok Toko</option>
            </select>
          </div>

          {unitOwnership === "store_stock" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label htmlFor="rma-stock-origin" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                Asal Stok <span style={{ color: "var(--accent-brand)" }}>*</span>
              </label>
              <input
                id="rma-stock-origin"
                className="form-input"
                value={stockOrigin}
                onChange={(e) => setStockOrigin(e.target.value)}
                placeholder="Misal: Gudang Nagoya rak B3"
              />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                Nota Pembelian <span style={{ color: "var(--accent-brand)" }}>*</span>
              </label>
              {attachments.length > 0 ? (
                <select
                  className="form-input"
                  value={invoiceUrl}
                  onChange={(e) => setInvoiceUrl(e.target.value)}
                >
                  <option value="">Pilih lampiran tiket</option>
                  {attachments.map((a, i) => (
                    <option key={a.id} value={a.file_url}>
                      {"Lampiran " + (i + 1) + " (" + a.file_type + ")"}
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  Tiket ini belum punya lampiran. Unggah nota di bawah.
                </p>
              )}
              {!invoiceUrl && (
                <div style={{ marginTop: "0.5rem" }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.375rem",
                    }}
                  >
                    <FileText size={14} /> Unggah nota baru
                  </span>
                  <FileUpload onChange={setFiles} />
                </div>
              )}
            </div>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              cursor: "pointer",
              padding: "0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <input
              type="checkbox"
              checked={snVerified}
              onChange={(e) => setSnVerified(e.target.checked)}
              style={{ width: "1.1rem", height: "1.1rem", marginTop: "0.125rem" }}
            />
            <span style={{ fontSize: "0.875rem" }}>
              <strong>Serial number sudah saya cocokkan</strong> dengan fisik unit dan nota.
              <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Wajib dicentang. RMA menolak klaim tanpa verifikasi SN.
              </span>
            </span>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="rma-physical" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Kondisi Fisik <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <textarea
              id="rma-physical"
              className="form-input"
              rows={2}
              value={physicalCondition}
              onChange={(e) => setPhysicalCondition(e.target.value)}
              placeholder="Misal: lecet ringan di sudut kiri, segel utuh"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="rma-fault" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Deskripsi Kerusakan <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <textarea
              id="rma-fault"
              className="form-input"
              rows={2}
              value={faultDescription}
              onChange={(e) => setFaultDescription(e.target.value)}
              placeholder="Misal: layar berkedip saat booting"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="rma-test" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Hasil Tes <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <textarea
              id="rma-test"
              className="form-input"
              rows={2}
              value={testResult}
              onChange={(e) => setTestResult(e.target.value)}
              placeholder="Misal: reproduksi konsisten pada 3 kali percobaan"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Foto / Video Kondisi Kerusakan <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
              1–{MAX_DAMAGE_PHOTOS} berkas, foto atau video. Tim RMA memutuskan kelayakan klaim
              dari bukti ini — tanpa bukti mereka hanya punya tulisan. Untuk kerusakan yang
              kambuhan, video jauh lebih meyakinkan daripada foto. Total seluruh unggahan
              maksimal 20 MB.
            </p>
            <FileUpload
              onChange={setDamagePhotos}
              accept="image/*,image/heic,image/heif,video/*"
              maxFiles={MAX_DAMAGE_PHOTOS}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Rekomendasi Anda <span style={{ color: "var(--accent-brand)" }}>*</span>
            </label>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
              Menurut pemeriksaan Anda, apakah unit ini layak diklaim? Ini{" "}
              <strong>masukan</strong>, bukan keputusan — tim RMA yang memutuskan.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
              {([
                { value: "yes", label: "Layak diklaim", bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
                { value: "no", label: "Tidak layak", bg: "#fffbeb", fg: "#92400e", border: "#fde68a" },
              ] as const).map((opt) => {
                const active = recommendEligible === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecommendEligible(opt.value)}
                    className="btn"
                    style={{
                      background: active ? opt.bg : "transparent",
                      color: active ? opt.fg : "var(--text-secondary)",
                      border: `1px solid ${active ? opt.border : "var(--border)"}`,
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label htmlFor="rma-recommend-note" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Catatan Rekomendasi{" "}
              {recommendEligible === "no" ? (
                <span style={{ color: "var(--accent-brand)" }}>*</span>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>
                  (opsional)
                </span>
              )}
            </label>
            <textarea
              id="rma-recommend-note"
              className="form-input"
              rows={2}
              value={recommendNote}
              onChange={(e) => setRecommendNote(e.target.value)}
              placeholder={
                recommendEligible === "no"
                  ? "Wajib diisi. Misal: ada bekas cairan di board"
                  : "Opsional. Hal yang perlu diketahui tim RMA"
              }
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={closeDialog} disabled={isPending}>
              Batal
            </button>
            <button
              className="btn"
              style={{ background: "#16469d", color: "white" }}
              onClick={handleHandover}
              disabled={isPending}
            >
              {isPending ? "Menyerahkan..." : "Serahkan ke RMA"}
            </button>
          </div>
        </div>
      </Modal>

    </>
  );
}
