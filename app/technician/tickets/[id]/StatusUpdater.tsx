"use client";

import { useState, useTransition } from "react";
import { updateTicketStatusAction } from "@/app/actions/technician";
import { handoverToRmaAction } from "@/app/actions/rma";
import FileUpload from "@/components/ui/FileUpload";
import toast from "react-hot-toast";
import {
  Play, Pause, CheckCircle, XCircle,
  PackageCheck, Truck, ArrowRight, HandshakeIcon,
  ShieldCheck, FileText, Loader2, MailCheck, PartyPopper,
  type LucideIcon,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { uploadFailureMessage, UPLOAD_BUDGET_MB } from "@/lib/upload-limit";
import DraftBanner from "@/components/ui/DraftBanner";
import { useDraft, useDraftKey } from "@/lib/draft";
import { FormField } from "@/components/app/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TONE_CLASSES, type StatusTone } from "@/lib/status-display";
import { cn } from "@/lib/utils";
import { isHandledActionError } from "@/lib/navigation-signal";

/** Matches MAX_DAMAGE_PHOTOS in app/actions/rma.ts. */
const MAX_DAMAGE_PHOTOS = 5;

type Status = string;
type TimeLog = { id?: string; event: string; created_at: Date | string };

/** Solid action colours — the same hues the buttons had, as classes. */
const TONE_BUTTON = {
  green: "bg-green-600 text-white hover:bg-green-600/90",
  cyan: "bg-cyan-600 text-white hover:bg-cyan-600/90",
  violet: "bg-violet-600 text-white hover:bg-violet-600/90",
  danger: "bg-destructive text-white hover:bg-destructive/90",
} as const;

/**
 * Where the ticket's actions live. On a phone it is pinned to the bottom of
 * the screen, so Pause / Done stay under the thumb however far the page is
 * scrolled (owner's choice, 2026-10-31); from md up it sits in the page
 * header as before. The page leaves room for it at the bottom.
 */
function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="ticket-action-bar"
      className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur *:flex-1 md:static md:z-auto md:flex-wrap md:justify-end md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none md:*:flex-none"
    >
      {children}
    </div>
  );
}

function Spinner() {
  return <Loader2 aria-hidden="true" className="animate-spin" />;
}

/** The footer of a dialog: actions right-aligned, full width on a phone. */
function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">{children}</div>;
}

/** A labelled block for a control with no single input to point at (a file picker, a group). */
function FieldBlock({
  label,
  required,
  hint,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </span>
      {help && <p className="text-[0.8125rem] text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}

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
    <div className="flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">
          Step {step} of {total}
        </div>
        <div className="mb-0.5 text-[0.9375rem] font-bold text-foreground">{title}</div>
        <div className="text-[0.8125rem] leading-normal text-muted-foreground">{description}</div>
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
  intakeOwnership = null,
  intakeComplaint = null,
}: {
  ticketId: string;
  currentStatus: Status;
  timeLogs?: TimeLog[];
  pickupMethod?: "self_pickup" | "courier" | null;
  isSalesMode?: boolean;
  ticketType?: string;
  /** Existing ticket attachments, so the handover form can reuse the intake invoice. */
  attachments?: { id: string; file_url: string; file_type: string; kind?: string | null }[];
  /** Ownership recorded at intake. When present the handover shows it instead of asking. */
  intakeOwnership?: { unit_ownership: "customer" | "store_stock"; stock_origin: string | null } | null;
  /** The complaint typed at intake, as plain text: the handover starts from it. */
  intakeComplaint?: string | null;
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
  const [unitOwnership, setUnitOwnership] = useState<"customer" | "store_stock">(
    intakeOwnership?.unit_ownership ?? "customer",
  );
  const [stockOrigin, setStockOrigin] = useState(intakeOwnership?.stock_origin ?? "");
  const [snVerified, setSnVerified] = useState(false);
  const [physicalCondition, setPhysicalCondition] = useState("");
  // Starts from the complaint typed at intake, so it is not typed a second time;
  // the technician corrects or adds what the examination found.
  const [faultDescription, setFaultDescription] = useState(intakeComplaint ?? "");
  const [testResult, setTestResult] = useState("");
  // The invoice attached at intake is marked as one; it is chosen already.
  const intakeInvoice = attachments.find((a) => a.kind === "invoice") ?? null;
  const [invoiceUrl, setInvoiceUrl] = useState(intakeInvoice?.file_url ?? "");
  const [choosingInvoice, setChoosingInvoice] = useState(false);
  // Evidence and advice the RMA desk needs to rule on the claim.
  const [damagePhotos, setDamagePhotos] = useState<File[]>([]);
  const [recommendEligible, setRecommendEligible] = useState<"" | "yes" | "no">("");
  const [recommendNote, setRecommendNote] = useState("");

  // The handover form is long and typed on a phone, beside the unit. Kept per
  // ticket so a reload does not cost the technician the whole examination.
  // Photos and video cannot be kept and must be picked again.
  const handoverDraft = useDraft(useDraftKey(`rma-handover:${ticketId}`), {
    unitOwnership, stockOrigin, snVerified, physicalCondition, faultDescription,
    testResult, invoiceUrl, recommendEligible, recommendNote,
  });
  const restoreHandoverDraft = () => {
    const d = handoverDraft.offer?.data;
    if (!d) return;
    // Ownership recorded at intake is not the draft's to change.
    if (!intakeOwnership) setUnitOwnership(d.unitOwnership);
    setStockOrigin(d.stockOrigin); setSnVerified(d.snVerified);
    setPhysicalCondition(d.physicalCondition); setFaultDescription(d.faultDescription);
    setTestResult(d.testResult); setInvoiceUrl(d.invoiceUrl || intakeInvoice?.file_url || "");
    setRecommendEligible(d.recommendEligible); setRecommendNote(d.recommendNote);
  };

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

      // Caught so a failed send leaves the dialog open with everything typed.
      let result: Awaited<ReturnType<typeof handoverToRmaAction>>;
      try {
        result = await handoverToRmaAction(fd);
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isHandledActionError(err)) return;
        console.error("[handover] send failed:", err);
        toast.error(uploadFailureMessage(err));
        return;
      }
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      handoverDraft.finish();
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
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isHandledActionError(err)) return;
        console.error("Action error:", err);
        toast.error(uploadFailureMessage(err));
      }
    });
  };

  // ── Status label map ───────────────────────────────────────────────────────
  const statusLabels: Record<string, { Icon: LucideIcon; text: string; tone: StatusTone }> = {
    done:              { Icon: CheckCircle, text: "Work done — proceed with handover below", tone: "green" },
    ready_for_pickup:  { Icon: PackageCheck, text: "Item ready at counter — upload pickup handover proof", tone: "blue" },
    handed_to_courier: { Icon: Truck, text: "Package handed to courier — waiting for delivery confirmation", tone: "violet" },
    delivered:         { Icon: MailCheck, text: "Delivered — upload delivery proof to auto-complete", tone: "green" },
    completed:         { Icon: PartyPopper, text: "Ticket fully completed!", tone: "green" },
  };

  // ── Handover section (post-done statuses) ─────────────────────────────────
  const handoverStatuses = ["done", "ready_for_pickup", "handed_to_courier", "delivered", "completed"];
  const isInHandover = handoverStatuses.includes(currentStatus);

  if (isInHandover) {
    const info = statusLabels[currentStatus];
    // A PC build's handover belongs to Sales — but no Sales account exists yet
    // (they still work from the e-commerce system, not linked to SSO), so a
    // sold build could not be picked up at all (owner, 2026-11-12). Until Sales
    // accounts exist, the technician may run it too. Then: back to Sales only.
    const canHandover = ticketType === "pc_build" ? true : !isSalesMode;
    const hasAction =
      canHandover &&
      ((currentStatus === "done") || currentStatus === "ready_for_pickup" || currentStatus === "handed_to_courier");

    return (
      <>
        <div data-slot="status-updater" className="flex min-w-0 flex-col gap-3">
          {/* Status label */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold",
              TONE_CLASSES[info?.tone ?? "gray"],
            )}
          >
            {info && <info.Icon aria-hidden="true" className="size-[18px] shrink-0" />}
            {info?.text ?? currentStatus.replace(/_/g, " ")}
          </div>

          {/* Role Check for Handover */}
          {canHandover ? (
            hasAction && (
              <ActionBar>
                {/* ── Self-pickup path ── */}
                {currentStatus === "done" && pickupMethod !== "courier" && (
                  <Button size="lg" onClick={() => setActiveDialog("ready_confirm")} disabled={isPending} className={TONE_BUTTON.cyan}>
                    <PackageCheck aria-hidden="true" /> Mark as Ready for Pickup
                  </Button>
                )}

                {currentStatus === "ready_for_pickup" && (
                  <Button size="lg" onClick={() => setActiveDialog("pickup_proof")} disabled={isPending} className={TONE_BUTTON.green}>
                    <CheckCircle aria-hidden="true" /> Item Picked Up by Customer
                  </Button>
                )}

                {/* ── Courier path ── */}
                {currentStatus === "done" && pickupMethod === "courier" && (
                  <Button size="lg" onClick={() => setActiveDialog("courier_proof")} disabled={isPending} className={TONE_BUTTON.violet}>
                    <Truck aria-hidden="true" /> Proceed to Delivery
                  </Button>
                )}

                {currentStatus === "handed_to_courier" && (
                  <Button size="lg" onClick={() => setActiveDialog("delivery_proof")} disabled={isPending} className={TONE_BUTTON.green}>
                    <PackageCheck aria-hidden="true" /> Confirm Delivered
                  </Button>
                )}
              </ActionBar>
            )
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              {ticketType === "pc_build"
                ? "Waiting for Sales to manage handover."
                : "Waiting for Technician to manage handover."}
            </p>
          )}
        </div>

        {/* ── READY FOR PICKUP CONFIRM (no proof needed) ── */}
        <Modal open={activeDialog === "ready_confirm"} onClose={closeDialog} title="Mark as Ready for Pickup">
          <p className="text-[0.9375rem] text-muted-foreground">
            Confirm that the item is ready at the counter for customer pickup. The customer will be notified.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("ready_for_pickup")} disabled={isPending}>
              {isPending && <Spinner />}
              {isPending ? "Updating..." : "Confirm Ready"}
            </Button>
          </DialogActions>
        </Modal>

        {/* ── PICKUP PROOF — self-pickup: handover to customer ── */}
        <Modal open={activeDialog === "pickup_proof"} onClose={closeDialog} title="Pickup Handover Proof" maxWidth="540px">
          <ProofStepInfo
            step={2}
            total={2}
            icon={<HandshakeIcon aria-hidden="true" className="size-4" />}
            title="Upload Handover Proof"
            description="Take a photo of handing the item to the customer. This completes the ticket automatically."
          />
          <FieldBlock label="Proof Photo / File" required>
            <FileUpload onChange={setFiles} />
          </FieldBlock>
          <DialogActions>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("completed", null, { requireFiles: true })} disabled={isPending} className={TONE_BUTTON.green}>
              {isPending && <Spinner />}
              {isPending ? "Uploading..." : "Confirm Handover & Complete"}
            </Button>
          </DialogActions>
        </Modal>

        {/* ── COURIER PROOF — handover package to courier ── */}
        <Modal open={activeDialog === "courier_proof"} onClose={closeDialog} title="Proceed to Delivery" maxWidth="540px">
          <ProofStepInfo
            step={1}
            total={2}
            icon={<Truck aria-hidden="true" className="size-4" />}
            title="Upload Courier Handover Proof"
            description="Take a photo of handing the package to the courier / delivery service. Status will change to 'On Delivery'."
          />
          <FieldBlock label="Courier Handover Photo" required>
            <FileUpload onChange={setFiles} />
          </FieldBlock>
          <DialogActions>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("handed_to_courier", null, { requireFiles: true })} disabled={isPending} className={TONE_BUTTON.violet}>
              {isPending && <Spinner />}
              {isPending ? "Uploading..." : "Confirm Handover to Courier"}
            </Button>
          </DialogActions>
        </Modal>

        {/* ── DELIVERY PROOF — receipt/photo from courier ── */}
        <Modal open={activeDialog === "delivery_proof"} onClose={closeDialog} title="Confirm Delivery" maxWidth="540px">
          <ProofStepInfo
            step={2}
            total={2}
            icon={<PackageCheck aria-hidden="true" className="size-4" />}
            title="Upload Delivery Confirmation"
            description="Upload the proof from the courier that the item has been delivered to the recipient (e.g. delivery receipt, courier app screenshot). This auto-completes the ticket."
          />
          <FieldBlock label="Delivery Proof" required>
            <FileUpload onChange={setFiles} />
          </FieldBlock>
          <DialogActions>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => handleAction("delivered", null, { requireFiles: true })} disabled={isPending} className={TONE_BUTTON.green}>
              {isPending && <Spinner />}
              {isPending ? "Uploading..." : "Confirm Delivered & Complete"}
            </Button>
          </DialogActions>
        </Modal>
      </>
    );
  }

  // ── Default work-in-progress view ─────────────────────────────────────────
  if (isSalesMode) return null;

  return (
    <>
      {currentStatus === "waiting" || currentStatus === "on_progress" ? (
        <ActionBar>
          {currentStatus === "waiting" && (
            <Button size="lg" onClick={() => handleAction("on_progress", "START")} disabled={isPending}>
              {isPending ? <Spinner /> : <Play aria-hidden="true" />} Start Work
            </Button>
          )}

          {currentStatus === "on_progress" && isPaused && (
            <Button size="lg" variant="outline" onClick={() => setActiveDialog("resume")} disabled={isPending} className="bg-card">
              <Play aria-hidden="true" /> Resume Work
            </Button>
          )}

          {currentStatus === "on_progress" && !isPaused && (
            <>
              <Button size="lg" variant="outline" onClick={() => setActiveDialog("pause")} disabled={isPending} className="bg-card">
                <Pause aria-hidden="true" /> Pause
              </Button>
              {isWarrantyClaim ? (
                <Button size="lg" onClick={() => setActiveDialog("rma_handover")} disabled={isPending} className="grow-[2]">
                  <ShieldCheck aria-hidden="true" /> Serahkan ke RMA
                </Button>
              ) : (
                <Button size="lg" onClick={() => setActiveDialog("done")} disabled={isPending} className={cn(TONE_BUTTON.green, "grow-[2]")}>
                  <CheckCircle aria-hidden="true" /> Mark Done
                </Button>
              )}
              {/* Icon-only beside the main action on a phone; the label stays for screen readers. */}
              <Button
                size="lg"
                onClick={() => setActiveDialog("cancel")}
                disabled={isPending}
                className={cn(TONE_BUTTON.danger, "max-md:flex-none max-md:px-3")}
              >
                <XCircle aria-hidden="true" /> <span className="max-md:sr-only">Cancel</span>
              </Button>
            </>
          )}
        </ActionBar>
      ) : null}

      {/* ── PAUSE DIALOG — requires reason ── */}
      <Modal open={activeDialog === "pause"} onClose={closeDialog} title="Pause Work">
        <FormField label="Reason for Pausing" htmlFor="pause-reason" required>
          <Textarea
            id="pause-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Waiting for customer to approve part replacement..."
            className="bg-card"
          />
        </FormField>
        <DialogActions>
          <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
          <Button onClick={() => handleAction("on_progress", "PAUSE", { requireReason: true })} disabled={isPending}>
            {isPending && <Spinner />}
            {isPending ? "Saving..." : "Confirm Pause"}
          </Button>
        </DialogActions>
      </Modal>

      {/* ── RESUME DIALOG — no reason needed, just confirm ── */}
      <Modal open={activeDialog === "resume"} onClose={closeDialog} title="Resume Work">
        <p className="text-[0.9375rem] text-muted-foreground">Ready to continue working on this ticket?</p>
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", TONE_CLASSES.blue)}>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          Work timer will resume from where it left off.
        </div>
        <DialogActions>
          <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
          <Button onClick={() => handleAction("on_progress", "RESUME")} disabled={isPending}>
            {isPending && <Spinner />}
            {isPending ? "Resuming..." : "Resume Work"}
          </Button>
        </DialogActions>
      </Modal>

      {/* ── DONE DIALOG — requires proof files ── */}
      <Modal open={activeDialog === "done"} onClose={closeDialog} title="Mark Work as Done" maxWidth="560px">
        <ProofStepInfo
          step={1}
          total={pickupMethod === "courier" ? 3 : 2}
          icon={<CheckCircle aria-hidden="true" className="size-4" />}
          title="Upload Proof of Finished Work"
          description="Attach photos or videos showing the completed repair/service. This stops your working timer."
        />
        <FieldBlock label="Work Completion Proof" required>
          <FileUpload onChange={setFiles} />
        </FieldBlock>
        <DialogActions>
          <Button variant="ghost" onClick={closeDialog}>Go Back</Button>
          <Button onClick={() => handleAction("done", "DONE", { requireFiles: true })} disabled={isPending} className={TONE_BUTTON.green}>
            {isPending && <Spinner />}
            {isPending ? "Uploading..." : "Confirm Work Done"}
          </Button>
        </DialogActions>
      </Modal>

      {/* ── CANCEL DIALOG ── */}
      <Modal open={activeDialog === "cancel"} onClose={closeDialog} title="Cancel Ticket" maxWidth="560px">
        <FormField label={<span className="text-destructive">Reason for Cancelling</span>} htmlFor="cancel-reason" required>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this ticket is being cancelled..."
            className="bg-card"
          />
        </FormField>
        <FieldBlock label="Attachments" hint="(optional)">
          <FileUpload onChange={setFiles} />
        </FieldBlock>
        <DialogActions>
          <Button variant="ghost" onClick={closeDialog}>Go Back</Button>
          <Button onClick={() => handleAction("cancelled", null, { requireReason: true })} disabled={isPending} className={TONE_BUTTON.danger}>
            {isPending && <Spinner />}
            {isPending ? "Cancelling..." : "Confirm Cancellation"}
          </Button>
        </DialogActions>
      </Modal>

      {/* Warranty claim: service form before handing the unit to the RMA desk */}
      <Modal open={activeDialog === "rma_handover"} onClose={closeDialog} title="Serahkan Unit ke RMA" maxWidth="640px">
        <ProofStepInfo
          step={1}
          total={1}
          icon={<ShieldCheck aria-hidden="true" className="size-[18px]" />}
          title="Service Form"
          description="Isi hasil pemeriksaan unit. Data ini yang diverifikasi tim RMA sebelum klaim diajukan ke vendor."
        />

        {handoverDraft.offer && (
          <DraftBanner
            savedAt={handoverDraft.offer.savedAt}
            note="Foto/video kerusakan dan nota perlu dipilih ulang."
            onRestore={restoreHandoverDraft}
            onDiscard={handoverDraft.discard}
          />
        )}

        <FormField label="Kepemilikan Unit" htmlFor="rma-ownership" required>
          {intakeOwnership ? (
            // Decided at the counter when the unit arrived; not re-asked here.
            <p id="rma-ownership" className="rounded-lg border border-input bg-muted px-3 py-2.5 text-sm">
              {intakeOwnership.unit_ownership === "store_stock" ? "Stok Toko" : "Milik Customer"}
              <span className="text-[0.8125rem] text-muted-foreground"> — dicatat saat intake</span>
            </p>
          ) : (
            <NativeSelect
              id="rma-ownership"
              value={unitOwnership}
              onChange={(e) => setUnitOwnership(e.target.value as "customer" | "store_stock")}
            >
              <option value="customer">Milik Customer</option>
              <option value="store_stock">Stok Toko</option>
            </NativeSelect>
          )}
        </FormField>

        {unitOwnership === "store_stock" ? (
          <FormField label="Asal Stok" htmlFor="rma-stock-origin" required>
            <Input
              id="rma-stock-origin"
              value={stockOrigin}
              onChange={(e) => setStockOrigin(e.target.value)}
              placeholder="Misal: Gudang Nagoya rak B3"
              className="bg-card"
            />
          </FormField>
        ) : (
          <FormField label="Nota Pembelian" htmlFor="rma-invoice" required>
            {intakeInvoice && invoiceUrl === intakeInvoice.file_url && !choosingInvoice ? (
              // Attached at the counter: shown, not asked again.
              <div id="rma-invoice" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-input bg-muted px-3 py-2.5 text-sm">
                <span>
                  <FileText aria-hidden="true" className="mr-1.5 inline size-3.5" />
                  Nota pembelian
                  <span className="text-[0.8125rem] text-muted-foreground"> — dilampirkan saat intake</span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setChoosingInvoice(true)}>
                  Ganti
                </Button>
              </div>
            ) : attachments.length > 0 ? (
              <NativeSelect id="rma-invoice" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)}>
                <option value="">Pilih lampiran tiket</option>
                {attachments.map((a, i) => (
                  <option key={a.id} value={a.file_url}>
                    {(a.kind === "invoice" ? "Nota pembelian (intake)" : "Lampiran " + (i + 1)) + " (" + a.file_type + ")"}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">Tiket ini belum punya lampiran. Unggah nota di bawah.</p>
            )}
            {!invoiceUrl && (
              <div className="mt-2 flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                  <FileText aria-hidden="true" className="size-3.5" /> Unggah nota baru
                </span>
                <FileUpload onChange={setFiles} />
              </div>
            )}
          </FormField>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={snVerified}
            onChange={(e) => setSnVerified(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary md:size-4"
          />
          <span className="text-sm">
            <strong>Serial number sudah saya cocokkan</strong> dengan fisik unit dan nota.
            <span className="block text-[0.8125rem] text-muted-foreground">
              Wajib dicentang. RMA menolak klaim tanpa verifikasi SN.
            </span>
          </span>
        </label>

        <FormField label="Kondisi Fisik" htmlFor="rma-physical" required>
          <Textarea
            id="rma-physical"
            rows={2}
            value={physicalCondition}
            onChange={(e) => setPhysicalCondition(e.target.value)}
            placeholder="Misal: lecet ringan di sudut kiri, segel utuh"
            className="bg-card"
          />
        </FormField>

        <FormField label="Deskripsi Kerusakan" htmlFor="rma-fault" required>
          <Textarea
            id="rma-fault"
            rows={2}
            value={faultDescription}
            onChange={(e) => setFaultDescription(e.target.value)}
            placeholder="Misal: layar berkedip saat booting"
            className="bg-card"
          />
        </FormField>

        <FormField label="Hasil Tes" htmlFor="rma-test" required>
          <Textarea
            id="rma-test"
            rows={2}
            value={testResult}
            onChange={(e) => setTestResult(e.target.value)}
            placeholder="Misal: reproduksi konsisten pada 3 kali percobaan"
            className="bg-card"
          />
        </FormField>

        <FieldBlock
          label="Foto / Video Kondisi Kerusakan"
          required
          help={
            <>
              1–{MAX_DAMAGE_PHOTOS} berkas, foto atau video. Tim RMA memutuskan kelayakan klaim
              dari bukti ini — tanpa bukti mereka hanya punya tulisan. Untuk kerusakan yang
              kambuhan, video jauh lebih meyakinkan daripada foto. Total seluruh unggahan
              maksimal {UPLOAD_BUDGET_MB} MB — rekam video singkat, atau set kamera ke 720p.
            </>
          }
        >
          <FileUpload
            onChange={setDamagePhotos}
            accept="image/*,image/heic,image/heif,video/*"
            maxFiles={MAX_DAMAGE_PHOTOS}
          />
        </FieldBlock>

        <FieldBlock
          label="Rekomendasi Anda"
          required
          help={
            <>
              Menurut pemeriksaan Anda, apakah unit ini layak diklaim? Ini{" "}
              <strong>masukan</strong>, bukan keputusan — tim RMA yang memutuskan.
            </>
          }
        >
          <div role="group" aria-label="Rekomendasi Anda" className="grid grid-cols-2 gap-2 sm:flex">
            {([
              { value: "yes", label: "Layak diklaim", tone: "green" },
              { value: "no", label: "Tidak layak", tone: "amber" },
            ] as const).map((opt) => {
              const active = recommendEligible === opt.value;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  variant="outline"
                  aria-pressed={active}
                  onClick={() => setRecommendEligible(opt.value)}
                  className={cn("bg-card", active && cn("font-bold", TONE_CLASSES[opt.tone]))}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </FieldBlock>

        <FormField
          label="Catatan Rekomendasi"
          htmlFor="rma-recommend-note"
          required={recommendEligible === "no"}
          hint={recommendEligible === "no" ? undefined : " (opsional)"}
        >
          <Textarea
            id="rma-recommend-note"
            rows={2}
            value={recommendNote}
            onChange={(e) => setRecommendNote(e.target.value)}
            placeholder={
              recommendEligible === "no"
                ? "Wajib diisi. Misal: ada bekas cairan di board"
                : "Opsional. Hal yang perlu diketahui tim RMA"
            }
            className="bg-card"
          />
        </FormField>

        <DialogActions>
          <Button variant="ghost" onClick={closeDialog} disabled={isPending}>
            Batal
          </Button>
          <Button onClick={handleHandover} disabled={isPending}>
            {isPending && <Spinner />}
            {isPending ? "Menyerahkan..." : "Serahkan ke RMA"}
          </Button>
        </DialogActions>
      </Modal>
    </>
  );
}
