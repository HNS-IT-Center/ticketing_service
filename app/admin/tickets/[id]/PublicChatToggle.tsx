"use client";

import { useState, useTransition } from "react";
import { togglePublicChatAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { MessageSquare } from "lucide-react";
import { errorOf } from "@/lib/action-result";
import { cn } from "@/lib/utils";

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
      const error = errorOf(result);
      if (error) {
        toast.error(error);
      } else {
        setEnabled(next);
        toast.success(next ? "Public chat enabled" : "Public chat disabled");
      }
    });
  };

  // A real switch for assistive tech: role="switch" with aria-checked, and the
  // visible "Public Chat" text as its name. The 44px hit area on a phone is the
  // label around it; the track itself stays small.
  return (
    <label data-slot="public-chat-toggle" className="flex min-h-11 cursor-pointer items-center gap-2.5 md:min-h-0">
      <MessageSquare aria-hidden="true" className={cn("size-[15px]", enabled ? "text-primary" : "text-muted-foreground")} />
      <span className="text-[0.8125rem] text-muted-foreground">Public Chat</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={isPending}
        title={enabled ? "Disable public chat" : "Enable public chat"}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
          enabled ? "bg-primary" : "bg-gray-300",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[3px] size-4 rounded-full bg-white shadow-sm transition-[left]",
            enabled ? "left-[21px]" : "left-[3px]",
          )}
        />
      </button>
      <span aria-hidden="true" className={cn("text-xs font-semibold", enabled ? "text-primary" : "text-muted-foreground")}>
        {enabled ? "ON" : "OFF"}
      </span>
    </label>
  );
}
