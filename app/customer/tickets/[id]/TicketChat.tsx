"use client";

import { useState, useRef, useEffect } from "react";
import { sendMessageAction } from "@/app/actions/tickets";
import { Send } from "lucide-react";

interface Message {
  id: string;
  message: string;
  created_at: string;
  is_read: boolean;
  isOwn: boolean;
  sender: { name: string; role: string };
}

export default function TicketChat({
  ticketId,
  messages: initial,
  currentUserId,
}: {
  ticketId: string;
  messages: Message[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      message: text,
      created_at: new Date().toISOString(),
      is_read: false,
      isOwn: true,
      sender: { name: "You", role: "Customer" },
    };
    setMessages((prev) => [...prev, optimistic]);
    const msg = text;
    setText("");
    await sendMessageAction(ticketId, msg);
    setSending(false);
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-light)" }}>
        <h3>Messages</h3>
      </div>
      <div className="chat-messages" style={{ height: "320px" }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem", fontSize: "0.9rem" }}>
            No messages yet. Start a conversation with your technician.
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.isOwn ? "flex-end" : "flex-start" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                {m.isOwn ? "You" : m.sender.name}
              </div>
              <div className={`chat-bubble ${m.isOwn ? "sent" : "received"}`}>
                {m.message}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-area">
        <input
          type="text"
          className="form-input"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="btn btn-primary"
          style={{ flexShrink: 0, minWidth: "2.75rem" }}
        >
          {sending ? <span className="spinner spinner-sm" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
