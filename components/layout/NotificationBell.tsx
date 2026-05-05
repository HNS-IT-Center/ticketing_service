"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

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
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="notif-bell"
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) markAllRead();
        }}
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
              <span
                style={{
                  fontSize: "0.75rem",
                  background: "var(--accent)",
                  color: "#fff",
                  padding: "0.125rem 0.5rem",
                  borderRadius: "999px",
                  fontWeight: 600,
                }}
              >
                {unreadCount} new
              </span>
            )}
          </div>

          <div style={{ maxHeight: "320px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
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
                  onClick={() => setOpen(false)}
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
