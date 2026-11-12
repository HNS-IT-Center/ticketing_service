"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { ClipboardList, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getTicketPoints } from "@/lib/points";

/**
 * How often the pending-request list is refetched, in milliseconds.
 *
 * Matches NotificationBell. Kept as its own constant rather than shared,
 * because the two answer different questions and may well want different
 * intervals later.
 */
const POLL_MS = 30_000;

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
    cleaning_detail?: { service_package: string | null } | null;
  };
}


export default function RequestsBell() {
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

  /**
   * Initial load, then refresh on an interval.
   *
   * This was a Supabase Realtime subscription on inserts into
   * TicketAssignmentRequest. That mechanism reads PostgreSQL's write-ahead log
   * through Supabase and has no MariaDB equivalent, so after the port it would
   * never fire — leaving a coordinator staring at a count that only changed
   * when they reloaded the page.
   *
   * A technician waiting for approval is the one being kept waiting here, so
   * the interval matters more than it does for a read-only badge.
   */
  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, POLL_MS);
    return () => clearInterval(id);
  }, [fetchRequests]);

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
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
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
    <div ref={ref} data-slot="requests-bell" className="relative">
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-label={pendingCount > 0 ? `Ticket Requests, ${pendingCount} pending` : "Ticket Requests"}
        title="Ticket Assignment Requests"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <ClipboardList />
        {pendingCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tone-violet-fg px-1 text-[0.625rem] leading-none font-bold text-white tabular-nums"
          >
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Ticket Requests"
          className="fixed top-[calc(var(--topbar-height,56px)+0.5rem)] right-2 z-[200] w-[min(380px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-tone-violet-bg/60 px-4 py-3">
            <div className="flex items-center gap-2 text-tone-violet-fg">
              <ClipboardList aria-hidden="true" className="size-4" />
              <span className="text-[0.9375rem] font-bold">Ticket Requests</span>
            </div>
            {pendingCount > 0 && (
              <span className="rounded-full bg-tone-violet-fg px-2 py-0.5 text-[0.7rem] font-bold text-white">
                {pendingCount} pending
              </span>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {!loaded ? (
              <div className="flex flex-col gap-2 px-4 py-4" aria-label="Loading…">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <ClipboardList aria-hidden="true" className="size-8 opacity-20" />
                No pending requests
              </div>
            ) : (
              requests.map((req) => {
                const handled = handledIds[req.id];
                const pts = getTicketPoints(req.ticket.ticket_type, req.ticket.device_type, req.ticket.cleaning_detail?.service_package);

                return (
                  <div
                    key={req.id}
                    className={cn(
                      "flex flex-col gap-2 border-b border-border px-4 py-3 transition-all last:border-b-0",
                      handled && "bg-muted/60 opacity-60",
                    )}
                  >
                    {/* Top row: ticket code + points */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-primary">#{req.ticket.ticket_code}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.7rem] font-bold",
                          pts >= 4
                            ? "bg-tone-violet-bg text-tone-violet-fg"
                            : pts === 3
                            ? "bg-tone-blue-bg text-tone-blue-fg"
                            : "bg-tone-green-bg text-tone-green-fg",
                        )}
                      >
                        ⭐ {pts} pts
                      </span>
                    </div>

                    {/* Middle row: type + technician */}
                    <div className="flex flex-col gap-0.5 text-[0.8125rem] text-muted-foreground">
                      <span className="capitalize">
                        {req.ticket.ticket_type.replace(/_/g, " ")}
                        {req.ticket.device_type ? ` · ${req.ticket.device_type.replace(/_/g, " ")}` : ""}
                      </span>
                      <span className="text-foreground">
                        👤 <strong>{req.technician.name}</strong> wants this ticket
                      </span>
                      <span className="text-xs">{new Date(req.created_at).toLocaleString()}</span>
                    </div>

                    {/* Action buttons / result label */}
                    {handled ? (
                      <div
                        className={cn(
                          "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[0.8rem] font-bold",
                          handled === "accept" ? "bg-tone-green-bg text-tone-green-fg" : "bg-tone-red-bg text-tone-red-fg",
                        )}
                      >
                        {handled === "accept" ? <><Check size={12} /> Approved</> : <><X size={12} /> Rejected</>}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleAction(req.id, "accept")}
                          disabled={isPending}
                          className="flex-1 bg-tone-green-fg text-white hover:bg-tone-green-fg/90"
                        >
                          <Check aria-hidden="true" /> Accept
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleAction(req.id, "reject")}
                          disabled={isPending}
                          className="flex-1 border-tone-red-border bg-card text-destructive hover:bg-tone-red-bg hover:text-destructive"
                        >
                          <X aria-hidden="true" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {requests.length > 0 && (
            <div className="border-t border-border px-4 py-1 text-center">
              <Button variant="ghost" size="sm" onClick={fetchRequests} className="text-xs text-muted-foreground">
                ↻ Refresh
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
