"use client";

import { useState, useTransition } from "react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
import { uploadDeliveryProofAction } from "@/app/actions/delivery";
import toast from "react-hot-toast";
import { CheckCircle, Truck, Package, Flag, Printer, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";


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

export default function AdminWorkflowPanel({ ticketId, currentStatus, pickupMethod, customerAddress, userRole }: Props) {
  const [isPending, startTransition] = useTransition();

  // Dialog states
  const [activeDialog, setActiveDialog] = useState<"courier_handover" | "self_pickup_complete" | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const isSales = userRole === "Administrator" || userRole === "Sales";

  const moveStatus = (status: TicketStatus) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, status);
      if ((result as any)?.error) toast.error((result as any).error);
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
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("file", file);
      
      if (activeDialog === "courier_handover") {
        fd.append("status", "handed_to_courier");
        fd.append("proofType", "payment");
      } else {
        fd.append("status", "completed");
        fd.append("proofType", "progress");
      }

      const res = await uploadDeliveryProofAction(fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(activeDialog === "courier_handover" ? "Handed to courier successfully" : "Completed successfully");
        setActiveDialog(null);
        setFile(null);
      }
    });
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setFile(null);
  };

  const isTerminal = ["completed", "cancelled", "rejected"].includes(currentStatus);

  return (
    <div className="card" style={{ border: "2px solid var(--primary-light, #e0e7ff)" }}>
      <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Flag size={18} style={{ color: "var(--primary)" }} />
        Workflow Actions
      </h3>

      {isTerminal ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          This ticket is in a terminal state: <strong>{currentStatus.replace(/_/g, " ")}</strong>.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Print buttons — Sales/Admin only */}
          {isSales && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-light)", marginBottom: "0.25rem" }}>
              <button
                type="button"
                onClick={() => toast("🖨️ Print Tanda Terima — Feature coming soon")}
                className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
              >
                <Printer size={15} /> Print Tanda Terima
              </button>
              <button
                type="button"
                onClick={() => toast("📄 Print Surat Penyerahan — Feature coming soon")}
                className="btn btn-ghost"
                style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
              >
                <Printer size={15} /> Print Surat Penyerahan
              </button>
            </div>
          )}

          {/* Post-done handover buttons */}
          {currentStatus === "done" && isSales && (
            <>
              {pickupMethod === "courier" ? (
                <button
                  onClick={() => setActiveDialog("courier_handover")}
                  disabled={isPending}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <Truck size={16} />
                  Hand to Courier
                </button>
              ) : (
                <button
                  onClick={() => moveStatus("ready_for_pickup")}
                  disabled={isPending}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <Package size={16} />
                  Mark Ready for Pickup
                </button>
              )}
            </>
          )}

          {currentStatus === "ready_for_pickup" && isSales && (
            <button
              onClick={() => moveStatus("waiting_pickup")}
              disabled={isPending}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Package size={16} />
              {isPending ? "Processing..." : "Customer Notified — Waiting Pickup"}
            </button>
          )}

          {currentStatus === "waiting_pickup" && isSales && (
            <button
              onClick={() => setActiveDialog("self_pickup_complete")}
              disabled={isPending}
              className="btn"
              style={{ background: "#16a34a", color: "white", display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle size={16} />
              Mark Picked Up — Complete
            </button>
          )}

          {currentStatus === "handed_to_courier" && isSales && (
            <button
              onClick={() => moveStatus("delivered")}
              disabled={isPending}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Truck size={16} />
              {isPending ? "Processing..." : "Mark Delivered"}
            </button>
          )}

          {currentStatus === "delivered" && isSales && (
            <button
              onClick={() => moveStatus("completed")}
              disabled={isPending}
              className="btn"
              style={{ background: "#16a34a", color: "white", display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle size={16} />
              {isPending ? "Processing..." : "Confirm Completed"}
            </button>
          )}

          {!["done", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered"].includes(currentStatus) && isSales && currentStatus !== "completed" && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Handover actions become available once technician marks ticket as <strong>Done</strong>.
            </p>
          )}
        </div>
      )}

      {/* Dialog for Courier Handover */}
      <Dialog open={activeDialog === "courier_handover"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand to Courier</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProofSubmit} className="flex flex-col gap-4 py-4">
            <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm">
              <p className="font-semibold mb-1">Customer Address:</p>
              <p className="mb-2">{customerAddress || "No address provided."}</p>
              <button type="button" className="btn btn-outline" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={copyAddress}>
                Copy Address
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Upload Payment Proof (Required)</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="form-input"
                required
              />
            </div>
            
            <DialogFooter>
              <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isPending || !file}>
                {isPending ? "Uploading..." : "Upload & Hand to Courier"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Self Pickup Completion */}
      <Dialog open={activeDialog === "self_pickup_complete"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Handover</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProofSubmit} className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Upload Progress Proof / Handover Photo (Required)</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="form-input"
                required
              />
            </div>
            
            <DialogFooter>
              <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isPending || !file}>
                {isPending ? "Uploading..." : "Upload & Complete"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
