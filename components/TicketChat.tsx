"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Send, Check, CheckCheck, Loader2 } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMessageAction } from "@/app/actions/tickets";
import toast from "react-hot-toast";
import { isNavigationSignal } from "@/lib/navigation-signal";

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
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    startTransition(async () => {
      try {
        await sendMessageAction(ticketId, newMessage);
        setNewMessage("");
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        toast.error((err instanceof Error && err.message) || "Failed to send message");
      }
    });
  };

  return (
    // Staff chat on the ticket detail pages; a self-contained card (it brings
    // its own data-slot), so it sits inside the legacy pages too.
    <section data-slot="ticket-chat" className="flex h-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="border-b border-border bg-muted px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">Discussion</h3>
      </div>

      <div ref={chatContainerRef} aria-live="polite" className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="m-auto text-center text-sm text-muted-foreground">
            No messages yet. Send a message to start the discussion.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col", msg.isOwn ? "items-end" : "items-start")}>
              <span className="mx-1 mb-1 text-[0.7rem] text-muted-foreground">
                {msg.sender.name} • {msg.sender.role}
              </span>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-snug shadow-xs [overflow-wrap:anywhere]",
                  msg.isOwn ? "rounded-br-none bg-primary text-primary-foreground" : "rounded-bl-none bg-muted text-foreground",
                )}
              >
                {msg.message}
              </div>
              <div className="mx-1 mt-1 flex items-center gap-1 text-[0.7rem] text-muted-foreground">
                {formatDateTime(msg.created_at)}
                {msg.isOwn &&
                  (msg.is_read ? (
                    <CheckCheck aria-label="Read" className="size-3 text-primary" />
                  ) : (
                    <Check aria-label="Sent" className="size-3" />
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor={`ticket-chat-${ticketId}`} className="sr-only">Message</label>
          <Input
            id={`ticket-chat-${ticketId}`}
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isPending}
            className="flex-1 bg-card"
          />
          <Button type="submit" size="icon" disabled={isPending || !newMessage.trim()} aria-label="Send message">
            {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
          </Button>
        </form>
      </div>
    </section>
  );
}
