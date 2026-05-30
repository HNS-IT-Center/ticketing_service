"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

export default function NotificationBell({ userId, role }: { userId: string; role: string }) {
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

  // Poll unread count initially, then listen to realtime inserts
  useEffect(() => {
    pollUnreadCount();

    const channel = supabase
      .channel("realtime:notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Notification",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setUnreadCount((prev) => prev + 1);
          // If the list is currently open, we should fetch it again or optimistically insert
          if (listLoaded) {
            fetchFullList();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollUnreadCount, userId, listLoaded, fetchFullList]);

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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="notif-bell"
        onClick={handleBellClick}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notif-dot" />}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: "0.5rem",
            top: "calc(var(--topbar-height, 56px) + 0.5rem)",
            width: "min(320px, calc(100vw - 1rem))",
            background: "var(--white)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
            overflow: "hidden",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            style={{
              padding: "0.875rem 1rem",
              borderBottom: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: "0.75rem",
                  background: "var(--accent)",
                  color: "#fff",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "999px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {unreadCount} new · Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: "320px", overflowY: "auto" }}>
            {!listLoaded ? (
              <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: "2rem 1rem",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.875rem",
                }}
              >
                No notifications
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => {
                const ticketLink =
                  role === "technician"
                    ? `/technician/tickets/${n.ticket_id}`
                    : role === "admin"
                    ? `/admin/tickets/${n.ticket_id}`
                    : `/customer/tickets/${n.ticket_id}`;

                const notifLabel =
                  n.type === "message"
                    ? "💬 New message on your ticket"
                    : n.type === "assigned"
                    ? "📋 You have been assigned a ticket"
                    : n.type === "completed"
                    ? "🎉 Ticket completed — points earned!"
                    : "📋 Ticket status updated";

                return (
                  <Link
                    key={n.id}
                    href={ticketLink}
                    style={{
                      display: "block",
                      padding: "0.75rem 1rem",
                      borderBottom: "1px solid var(--border-light)",
                      background: n.is_read ? "transparent" : "rgba(22,70,157,0.04)",
                      textDecoration: "none",
                      color: "var(--text-primary)",
                      transition: "background 0.15s",
                      fontSize: "0.875rem",
                    }}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div style={{ fontWeight: n.is_read ? 400 : 600 }}>
                      {notifLabel}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
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
