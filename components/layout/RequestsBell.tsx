"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { ClipboardList, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AssignmentRequest {
  id: string;
  status: string;
  created_at: string;
  technician: { id: string; name: string };
  ticket: {
    id: string;
    ticket_code: string;
    ticket_type: string;
    device_type: string | null;
  };
}

function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export default function RequestsBell({ userId }: { userId: string }) {
  const [requests, setRequests]       = useState<AssignmentRequest[]>([]);
  const [open, setOpen]               = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [handledIds, setHandledIds]   = useState<Record<string, "accept" | "reject">>({});
  const [isPending, startTransition]  = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const pendingCount = requests.filter((r) => !handledIds[r.id]).length;

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/ticket-requests", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
        setLoaded(true);
      }
    } catch {
      // silently fail
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time: refresh when new request comes in for this admin/coordinator
  useEffect(() => {
    const channel = supabase
      .channel("realtime:ticket-requests")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "TicketAssignmentRequest",
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchRequests]);

  // Load list when opened
  useEffect(() => {
    if (open) fetchRequests();
  }, [open, fetchRequests]);

  // Click-outside close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAction = (requestId: string, action: "accept" | "reject") => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/ticket-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, action }),
        });
        if (res.ok) {
          setHandledIds((prev) => ({ ...prev, [requestId]: action }));
        }
      } catch {
        // silently fail
      }
    });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        className="notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ticket Requests"
        title="Ticket Assignment Requests"
      >
        <ClipboardList size={18} />
        {pendingCount > 0 && (
          <span className="notif-dot" style={{ background: "#7c3aed" }} />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: "3.5rem",
            top: "calc(var(--topbar-height, 56px) + 0.5rem)",
            width: "min(380px, calc(100vw - 1rem))",
            background: "var(--white)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
            overflow: "hidden",
            animation: "fadeIn 0.2s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "0.875rem 1rem",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(124,58,237,0.02) 100%)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ClipboardList size={16} style={{ color: "#7c3aed" }} />
              <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#7c3aed" }}>
                Ticket Requests
              </span>
            </div>
            {pendingCount > 0 && (
              <span style={{
                fontSize: "0.7rem", fontWeight: 700,
                background: "#7c3aed", color: "white",
                padding: "0.15rem 0.5rem", borderRadius: "999px",
              }}>
                {pendingCount} pending
              </span>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {!loaded ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Loading…
              </div>
            ) : requests.length === 0 ? (
              <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                <ClipboardList size={32} style={{ opacity: 0.15, marginBottom: "0.5rem", display: "block", margin: "0 auto 0.5rem" }} />
                No pending requests
              </div>
            ) : (
              requests.map((req) => {
                const handled = handledIds[req.id];
                const pts = getTicketPoints(req.ticket.ticket_type, req.ticket.device_type);

                return (
                  <div
                    key={req.id}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--border-light)",
                      background: handled ? "rgba(0,0,0,0.025)" : "var(--white)",
                      opacity: handled ? 0.6 : 1,
                      transition: "all 0.3s ease",
                    }}
                  >
                    {/* Top row: ticket code + points */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.875rem", color: "var(--primary)" }}>
                        #{req.ticket.ticket_code}
                      </span>
                      <span style={{
                        fontSize: "0.7rem", fontWeight: 700,
                        padding: "0.15rem 0.45rem", borderRadius: "999px",
                        background: pts >= 4 ? "rgba(124,58,237,0.1)" : pts === 3 ? "rgba(22,70,157,0.1)" : "rgba(22,163,74,0.1)",
                        color: pts >= 4 ? "#6d28d9" : pts === 3 ? "var(--primary)" : "#15803d",
                      }}>
                        ⭐ {pts} pts
                      </span>
                    </div>

                    {/* Middle row: type + technician */}
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                      <span style={{ textTransform: "capitalize" }}>
                        {req.ticket.ticket_type.replace(/_/g, " ")}
                        {req.ticket.device_type ? ` · ${req.ticket.device_type.replace(/_/g, " ")}` : ""}
                      </span>
                      <span style={{ display: "block", marginTop: "0.15rem" }}>
                        👤 <strong>{req.technician.name}</strong> wants this ticket
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>

                    {/* Action buttons / result label */}
                    {handled ? (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: "0.3rem",
                        fontSize: "0.8rem", fontWeight: 700,
                        color: handled === "accept" ? "#16a34a" : "#dc2626",
                        padding: "0.2rem 0.6rem", borderRadius: "999px",
                        background: handled === "accept" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                      }}>
                        {handled === "accept" ? <><Check size={12} /> Approved</> : <><X size={12} /> Rejected</>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => handleAction(req.id, "accept")}
                          disabled={isPending}
                          style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
                            padding: "0.35rem 0.75rem", borderRadius: "var(--radius-md)",
                            background: "#16a34a", color: "white", border: "none",
                            fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                            opacity: isPending ? 0.6 : 1,
                          }}
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          onClick={() => handleAction(req.id, "reject")}
                          disabled={isPending}
                          style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
                            padding: "0.35rem 0.75rem", borderRadius: "var(--radius-md)",
                            background: "var(--white)", color: "#dc2626",
                            border: "1.5px solid rgba(220,38,38,0.35)",
                            fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                            opacity: isPending ? 0.6 : 1,
                          }}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {requests.length > 0 && (
            <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border-light)", textAlign: "center" }}>
              <button
                onClick={fetchRequests}
                style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
              >
                ↻ Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
