"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorOf } from "@/lib/action-result";
import { cn } from "@/lib/utils";
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
      const error = errorOf(result);
      if (error) {
        toast.error(error);
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
    <section data-slot="public-chat" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-4 text-[0.9375rem] font-semibold text-foreground md:px-6">
        <MessageSquare aria-hidden="true" className="size-4 text-primary" />
        Chat
      </h2>
      <div className="flex max-h-[300px] flex-col gap-3 overflow-y-auto px-5 py-4 md:px-6" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Belum ada pesan</p>
        )}
        {messages.map((m) => {
          const isStaff = m.senderRole !== "Customer";
          return (
            <div key={m.id} className={cn("flex flex-col", isStaff ? "items-start" : "items-end")}>
              <div
                className={cn(
                  "max-w-[80%] px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]",
                  isStaff
                    ? "rounded-[0_12px_12px_12px] bg-secondary text-foreground"
                    : "rounded-[12px_12px_0_12px] bg-primary text-primary-foreground",
                )}
              >
                {m.message}
              </div>
              <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
                {m.senderName} · {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4 md:px-6">
        <label htmlFor="public-chat-name" className="sr-only">Nama Anda (opsional)</label>
        <Input
          id="public-chat-name"
          placeholder="Nama Anda (opsional)"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          className="bg-card"
        />
        <div className="flex gap-2">
          <label htmlFor="public-chat-text" className="sr-only">Pesan</label>
          <Input
            id="public-chat-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Tulis pesan..."
            className="flex-1 bg-card"
          />
          <Button
            type="button"
            size="icon"
            onClick={send}
            disabled={!text.trim() || isPending}
            aria-label="Kirim pesan"
          >
            {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </section>
  );
}
