"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Send, Check, CheckCheck, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { sendMessageAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";

interface Message {
  id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  sender: { name: string; role: string };
  isOwn: boolean;
}

interface Props {
  ticketId: string;
  messages: Message[];
  currentUserId: string | null;
  customerName?: string;
}

export default function TicketChat({ ticketId, messages, currentUserId, customerName }: Props) {
  const [newMessage, setNewMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    startTransition(async () => {
      try {
        await sendMessageAction(ticketId, newMessage);
        setNewMessage("");
      } catch (err: any) {
        toast.error(err.message || "Failed to send message");
      }
    });
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "500px", padding: 0 }}>
      <div style={{ padding: "1rem", borderBottom: "1px solid var(--border-light)", background: "var(--cream-dark)" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Discussion</h3>
      </div>
      
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {messages.length === 0 ? (
          <div style={{ margin: "auto", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            No messages yet. Send a message to start the discussion.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.isOwn ? "flex-end" : "flex-start" }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem", marginLeft: "0.25rem", marginRight: "0.25rem" }}>
                {msg.sender.name} • {msg.sender.role}
              </span>
              <div style={{
                background: msg.isOwn ? "var(--primary)" : "var(--cream)",
                color: msg.isOwn ? "white" : "var(--text-primary)",
                padding: "0.6rem 0.85rem",
                borderRadius: "12px",
                borderBottomRightRadius: msg.isOwn ? "0" : "12px",
                borderBottomLeftRadius: msg.isOwn ? "12px" : "0",
                maxWidth: "85%",
                fontSize: "0.875rem",
                lineHeight: 1.4,
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}>
                {msg.message}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.25rem", fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.25rem", marginRight: "0.25rem" }}>
                {formatDateTime(msg.created_at)}
                {msg.isOwn && (
                  msg.is_read ? <CheckCheck size={12} color="var(--primary)" /> : <Check size={12} />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "1rem", borderTop: "1px solid var(--border-light)" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isPending}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={isPending || !newMessage.trim()} style={{ padding: "0.5rem 1rem" }}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
