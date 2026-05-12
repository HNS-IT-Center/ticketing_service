"use client";

import { useState, useTransition } from "react";
import { togglePublicChatAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { MessageSquare } from "lucide-react";

export default function PublicChatToggle({
  ticketId,
  initialEnabled,
}: {
  ticketId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    startTransition(async () => {
      const result = await togglePublicChatAction(ticketId, next);
      if ((result as any)?.error) {
        toast.error((result as any).error);
      } else {
        setEnabled(next);
        toast.success(next ? "Public chat enabled" : "Public chat disabled");
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <MessageSquare size={15} style={{ color: enabled ? "var(--primary)" : "var(--text-muted)" }} />
      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Public Chat</span>
      <button
        onClick={toggle}
        disabled={isPending}
        style={{
          position: "relative",
          width: "40px",
          height: "22px",
          borderRadius: "999px",
          border: "none",
          background: enabled ? "var(--primary)" : "#d1d5db",
          cursor: isPending ? "not-allowed" : "pointer",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
        title={enabled ? "Disable public chat" : "Enable public chat"}
      >
        <span style={{
          position: "absolute",
          top: "3px",
          left: enabled ? "21px" : "3px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: enabled ? "var(--primary)" : "var(--text-muted)" }}>
        {enabled ? "ON" : "OFF"}
      </span>
    </div>
  );
}
