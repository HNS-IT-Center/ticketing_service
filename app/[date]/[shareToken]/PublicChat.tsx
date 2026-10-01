"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { sendPublicMessageAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";

interface Message {
  id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  senderName: string;
  senderRole: string;
}

export default function PublicChat({
  ticketId,
  shareToken,
  messages: initialMessages,
}: {
  ticketId: string;
  shareToken: string;
  messages: Message[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [isPending, startTransition] = useTransition();

  const send = () => {
    if (!text.trim()) return;
    startTransition(async () => {
      const result = await sendPublicMessageAction(ticketId, shareToken, text.trim(), senderName.trim() || "Customer");
      if ((result as any)?.error) {
        toast.error((result as any).error);
      } else {
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          message: text.trim(),
          created_at: new Date().toISOString(),
          is_read: false,
          senderName: senderName.trim() || "Customer",
          senderRole: "Customer",
        }]);
        setText("");
        toast.success("Pesan terkirim");
      }
    });
  };

  return (
    <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #f3f4f6", fontWeight: 600, fontSize: "0.9375rem", color: "#111827" }}>
        💬 Chat
      </div>
      <div style={{ padding: "1rem 1.5rem", maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {messages.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: "0.875rem", textAlign: "center" }}>Belum ada pesan</p>
        )}
        {messages.map((m) => {
          const isStaff = m.senderRole !== "Customer";
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isStaff ? "flex-start" : "flex-end" }}>
              <div style={{
                maxWidth: "80%", padding: "0.625rem 0.875rem",
                borderRadius: isStaff ? "0 12px 12px 12px" : "12px 12px 0 12px",
                background: isStaff ? "#f0f4ff" : "#6366f1",
                color: isStaff ? "#374151" : "#fff",
                fontSize: "0.875rem",
              }}>
                {m.message}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "2px" }}>
                {m.senderName} · {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid #f3f4f6" }}>
        <input
          placeholder="Nama Anda (opsional)"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "0.5rem", boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Tulis pesan..."
            style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem", fontFamily: "inherit" }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || isPending}
            style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", padding: "0.5rem 0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
