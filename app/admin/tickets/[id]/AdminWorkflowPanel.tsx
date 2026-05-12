"use client";

import { useState, useTransition } from "react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { CheckCircle, Truck, Package, Flag, Printer } from "lucide-react";

type TicketStatus =
  | "waiting" | "on_progress" | "done" | "ready_for_pickup"
  | "waiting_pickup" | "handed_to_courier" | "delivered" | "completed"
  | "cancelled" | "rejected";

interface Props {
  ticketId: string;
  currentStatus: TicketStatus;
  pickupMethod: string | null;
  userRole: string;
}

export default function AdminWorkflowPanel({ ticketId, currentStatus, pickupMethod, userRole }: Props) {
  const [isPending, startTransition] = useTransition();

  const isCS = userRole === "Administrator" || userRole === "Sales";

  const moveStatus = (status: TicketStatus) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, status);
      if ((result as any)?.error) toast.error((result as any).error);
      else toast.success(`Status updated to: ${status.replace(/_/g, " ")}`);
    });
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
          {/* Print buttons — CS/Admin only */}
          {isCS && (
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
          {currentStatus === "done" && isCS && (
            <>
              {pickupMethod === "courier" ? (
                <button
                  onClick={() => moveStatus("handed_to_courier")}
                  disabled={isPending}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <Truck size={16} />
                  {isPending ? "Processing..." : "Hand to Courier"}
                </button>
              ) : (
                <button
                  onClick={() => moveStatus("ready_for_pickup")}
                  disabled={isPending}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <Package size={16} />
                  {isPending ? "Processing..." : "Mark Ready for Pickup"}
                </button>
              )}
            </>
          )}

          {currentStatus === "ready_for_pickup" && isCS && (
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

          {currentStatus === "waiting_pickup" && isCS && (
            <button
              onClick={() => moveStatus("completed")}
              disabled={isPending}
              className="btn"
              style={{ background: "#16a34a", color: "white", display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle size={16} />
              {isPending ? "Processing..." : "Mark Picked Up — Complete"}
            </button>
          )}

          {currentStatus === "handed_to_courier" && isCS && (
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

          {currentStatus === "delivered" && isCS && (
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

          {!["done", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered"].includes(currentStatus) && isCS && currentStatus !== "completed" && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Handover actions become available once technician marks ticket as <strong>Done</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
