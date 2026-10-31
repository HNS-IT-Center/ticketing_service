"use client";

import { useState, useTransition } from "react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
import { uploadDeliveryProofAction } from "@/app/actions/delivery";
import toast from "react-hot-toast";
import { CheckCircle, Truck, Package, Flag, Printer, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorOf } from "@/lib/action-result";
import { compressFile, normalizeFileType } from "@/lib/compress";

type TicketStatus =
  | "waiting" | "on_progress" | "done" | "ready_for_pickup"
  | "waiting_pickup" | "handed_to_courier" | "delivered" | "completed"
  | "cancelled" | "rejected";

interface Props {
  ticketId: string;
  currentStatus: TicketStatus;
  pickupMethod: string | null;
  customerAddress?: string | null;
  userRole: string;
}

const SUCCESS = "bg-green-600 text-white hover:bg-green-600/90";

export default function AdminWorkflowPanel({ ticketId, currentStatus, pickupMethod, customerAddress, userRole }: Props) {
  const [isPending, startTransition] = useTransition();

  // Dialog states
  const [activeDialog, setActiveDialog] = useState<"courier_handover" | "self_pickup_complete" | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const isSales = userRole === "Administrator" || userRole === "Sales";

  const moveStatus = (status: TicketStatus) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, status);
      const error = errorOf(result);
      if (error) toast.error(error);
      else toast.success(`Status updated to: ${status.replace(/_/g, " ")}`);
    });
  };

  const copyAddress = () => {
    if (customerAddress) {
      navigator.clipboard.writeText(customerAddress);
      toast.success("Address copied to clipboard!");
    } else {
      toast.error("No address available.");
    }
  };

  const handleProofSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file to upload as proof");
      return;
    }

    startTransition(async () => {
      let uploadFile = normalizeFileType(file);
      toast("Processing file...", { id: "compress", icon: "⏳" });
      try {
        uploadFile = await compressFile(uploadFile);
      } catch (err) {
        console.warn("Compression failed", err);
      }
      toast.dismiss("compress");
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("file", uploadFile);

      if (activeDialog === "courier_handover") {
        fd.append("status", "handed_to_courier");
        fd.append("proofType", "payment");
      } else {
        fd.append("status", "completed");
        fd.append("proofType", "progress");
      }

      try {
        const res = await uploadDeliveryProofAction(fd);
        if (res.error) toast.error(res.error);
        else {
          toast.success(activeDialog === "courier_handover" ? "Handed to courier successfully" : "Completed successfully");
          setActiveDialog(null);
          setFile(null);
        }
      } catch (err) {
        console.error("Action error:", err);
        const message = err instanceof Error ? err.message : "";
        if (message.includes("Unexpected end of form") || message.includes("Body exceeded")) {
          toast.error("Upload failed: File size is too large. Please limit to 10MB.");
        } else {
          toast.error("An unexpected error occurred. Please try again.");
        }
      }
    });
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setFile(null);
  };

  const isTerminal = ["completed", "cancelled", "rejected"].includes(currentStatus);

  // The proof upload is the same field in both dialogs; only its label differs.
  const proofField = (label: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="workflow-proof">{label}</Label>
      <Input
        id="workflow-proof"
        type="file"
        accept="image/*,image/heic,image/heif"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="bg-card"
        required
      />
    </div>
  );

  const submitButton = (idle: string) => (
    <Button type="submit" disabled={isPending || !file}>
      {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
      {isPending ? "Uploading..." : idle}
    </Button>
  );

  return (
    <Card className="border-2 border-primary/20 ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Flag aria-hidden="true" className="size-[18px] text-primary" />
          Workflow Actions
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isTerminal ? (
          <p className="text-sm text-muted-foreground">
            This ticket is in a terminal state: <strong className="text-foreground">{currentStatus.replace(/_/g, " ")}</strong>.
          </p>
        ) : (
          <div className="flex flex-col gap-3 *:data-[slot=button]:w-full sm:*:data-[slot=button]:w-auto sm:*:data-[slot=button]:self-start">
            {/* Print buttons — Sales/Admin only */}
            {isSales && (
              <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:flex-wrap">
                <Button type="button" variant="ghost" onClick={() => toast("🖨️ Print Tanda Terima — Feature coming soon")}>
                  <Printer aria-hidden="true" /> Print Tanda Terima
                </Button>
                <Button type="button" variant="ghost" onClick={() => toast("📄 Print Surat Penyerahan — Feature coming soon")}>
                  <Printer aria-hidden="true" /> Print Surat Penyerahan
                </Button>
              </div>
            )}

            {/* Post-done handover buttons */}
            {currentStatus === "done" && isSales && (
              pickupMethod === "courier" ? (
                <Button onClick={() => setActiveDialog("courier_handover")} disabled={isPending}>
                  <Truck aria-hidden="true" />
                  Hand to Courier
                </Button>
              ) : (
                <Button onClick={() => moveStatus("ready_for_pickup")} disabled={isPending}>
                  <Package aria-hidden="true" />
                  Mark Ready for Pickup
                </Button>
              )
            )}

            {currentStatus === "ready_for_pickup" && isSales && (
              <Button onClick={() => moveStatus("waiting_pickup")} disabled={isPending}>
                <Package aria-hidden="true" />
                {isPending ? "Processing..." : "Customer Notified — Waiting Pickup"}
              </Button>
            )}

            {currentStatus === "waiting_pickup" && isSales && (
              <Button onClick={() => setActiveDialog("self_pickup_complete")} disabled={isPending} className={SUCCESS}>
                <CheckCircle aria-hidden="true" />
                Mark Picked Up — Complete
              </Button>
            )}

            {currentStatus === "handed_to_courier" && isSales && (
              <Button onClick={() => moveStatus("delivered")} disabled={isPending}>
                <Truck aria-hidden="true" />
                {isPending ? "Processing..." : "Mark Delivered"}
              </Button>
            )}

            {currentStatus === "delivered" && isSales && (
              <Button onClick={() => moveStatus("completed")} disabled={isPending} className={SUCCESS}>
                <CheckCircle aria-hidden="true" />
                {isPending ? "Processing..." : "Confirm Completed"}
              </Button>
            )}

            {!["done", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered"].includes(currentStatus) && isSales && currentStatus !== "completed" && (
              <p className="text-sm text-muted-foreground">
                Handover actions become available once technician marks ticket as <strong className="text-foreground">Done</strong>.
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Dialog for Courier Handover */}
      <Dialog open={activeDialog === "courier_handover"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
          <form onSubmit={handleProofSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Hand to Courier</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-start gap-2 rounded-lg border border-tone-blue-border bg-tone-blue-bg p-3 text-sm text-tone-blue-fg">
              <p className="font-semibold">Customer Address:</p>
              <p className="[overflow-wrap:anywhere]">{customerAddress || "No address provided."}</p>
              <Button type="button" variant="outline" size="sm" className="bg-card" onClick={copyAddress}>
                <Copy aria-hidden="true" /> Copy Address
              </Button>
            </div>
            {proofField("Upload Payment Proof (Required)")}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
              {submitButton("Upload & Hand to Courier")}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Self Pickup Completion */}
      <Dialog open={activeDialog === "self_pickup_complete"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
          <form onSubmit={handleProofSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Complete Handover</DialogTitle>
            </DialogHeader>
            {proofField("Upload Progress Proof / Handover Photo (Required)")}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
              {submitButton("Upload & Complete")}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
