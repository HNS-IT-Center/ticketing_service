"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ticketHrefForPortal, type Portal } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * How often the unread count is refetched, in milliseconds.
 *
 * 30s is a deliberate middle: short enough that a notification does not feel
 * lost, long enough that an idle dashboard left open all day makes 120
 * requests rather than thousands.
 */
const POLL_MS = 30_000;

interface Notification {
  id: string;
  type: string;
  ticket_id: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
  message?: string | null;
  ticket?: { ticket_code: string };
}

export default function NotificationBell({ role }: { role: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ── Fast poll: only fetch unread count (cheap COUNT query, no joins) ──
  const pollUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?count=1", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silently fail
    }
  }, []);

  // ── Load full notification list (only when bell is opened) ──
  const fetchFullList = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
        setListLoaded(true);
      }
    } catch {
      // silently fail
    }
  }, []);

  /**
   * Poll the unread count on an interval.
   *
   * This used to be a Supabase Realtime subscription, which pushed an update
   * the instant a Notification row was inserted. That mechanism reads
   * PostgreSQL's write-ahead log through Supabase; with the database moved to
   * MariaDB it has no equivalent and simply never fires, so the bell would sit
   * at its initial count forever.
   *
   * Polling is the honest replacement, not a downgrade in disguise: the cost is
   * that a new notification takes up to POLL_MS to appear instead of arriving
   * immediately. The endpoint it calls is a COUNT with no joins.
   *
   * If the list happens to be open, it is refreshed too, so the rows the user
   * is looking at do not contradict the badge above them.
   */
  useEffect(() => {
    pollUnreadCount();

    const id = setInterval(() => {
      pollUnreadCount();
      if (listLoaded) fetchFullList();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [pollUnreadCount, listLoaded, fetchFullList]);

  // Load full list when bell opens
  useEffect(() => {
    if (open && !listLoaded) {
      fetchFullList();
    }
  }, [open, listLoaded, fetchFullList]);

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

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleBellClick = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      // Refresh list on open
      fetchFullList();
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    setOpen(false);
    if (!n.is_read) {
      await fetch("/api/notifications", { 
        method: "POST", 
        body: JSON.stringify({ id: n.id }),
        headers: { "Content-Type": "application/json" }
      });
      setNotifications((prev) => prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  return (
    <div ref={ref} data-slot="notification-bell" className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative text-muted-foreground"
        onClick={handleBellClick}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-none font-bold text-destructive-foreground tabular-nums"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed top-[calc(var(--topbar-height,56px)+0.5rem)] right-2 z-[200] w-[min(320px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-[0.9375rem] font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {unreadCount} new · Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!listLoaded ? (
              <div className="flex flex-col gap-2 px-4 py-4" aria-label="Loading...">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <Bell aria-hidden="true" className="size-7 opacity-30" />
                No notifications
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => {
                const ticketLink = ticketHrefForPortal(role as Portal, n.ticket_id);

                const notifLabel =
                  n.type === "message"
                    ? "💬 New message on your ticket"
                    : n.type === "assigned"
                    ? "📋 You have been assigned a ticket"
                    : n.type === "needs_assignment"
                    ? "🆕 Tiket baru belum ada teknisi"
                    : n.type === "completed"
                    ? "🎉 Ticket completed — points earned!"
                    : "📋 Ticket status updated";

                return (
                  <Link
                    key={n.id}
                    href={ticketLink}
                    className={cn(
                      "block border-b border-border px-4 py-3 text-sm text-foreground outline-none last:border-b-0 hover:bg-muted focus-visible:bg-muted",
                      !n.is_read && "bg-secondary/60",
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className={n.is_read ? "font-normal" : "font-semibold"}>{notifLabel}</div>
                    {n.message && <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">{n.message}</div>}
                    <div className="mt-1 text-[0.8125rem] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
