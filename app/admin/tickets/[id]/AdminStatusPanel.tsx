"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { adminUpdateTicketStatusAction } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

type Status = string;

// Tone classes, not colours: Reject / Cancel used `var(--accent)`, which the
// UI-1 tokens made a light cream — white text on it was unreadable.
const TONE = {
  primary: "",
  success: "bg-green-600 text-white hover:bg-green-600/90",
  danger: "bg-destructive text-white hover:bg-destructive/90",
} as const;

const STATUS_ACTIONS: Record<string, { label: string; next: string; tone: keyof typeof TONE }[]> = {
  waiting: [
    { label: "Approve (On Progress)", next: "on_progress", tone: "primary" },
    { label: "Reject", next: "rejected", tone: "danger" },
  ],
  on_progress: [
    { label: "Mark Done", next: "done", tone: "success" },
    { label: "Cancel", next: "cancelled", tone: "danger" },
  ],
};

export default function AdminStatusPanel({
  ticketId,
  currentStatus,
  ticketType,
}: {
  ticketId: string;
  currentStatus: Status;
  ticketType?: string;
}) {
  const [isPending, startTransition] = useTransition();

  // A warranty claim leaves `waiting`/`on_progress` one way only: handed to the
  // RMA desk, which is what decides eligibility. The server refuses `done`
  // outright, so the button is not offered — a control whose only outcome is an
  // error is worse than no control.
  const isOpenClaim =
    ticketType === "warranty_claim" &&
    (currentStatus === "waiting" || currentStatus === "on_progress");

  const actions = (STATUS_ACTIONS[currentStatus] ?? []).filter(
    (a) => !(isOpenClaim && a.next === "done"),
  );

  // Removing the button can empty the row. Say why rather than render nothing,
  // or it reads as a page that failed to load.
  if (actions.length === 0) {
    if (!isOpenClaim) return null;
    return (
      <p data-slot="admin-status-note" className="max-w-[26rem] text-[0.8125rem] text-muted-foreground md:text-right">
        Tiket klaim garansi diselesaikan lewat tim RMA. Teknisi menyerahkan unit dari portal
        teknisi, lalu tim RMA yang memutuskan kelayakan klaimnya.
      </p>
    );
  }

  const update = (newStatus: string) => {
    startTransition(async () => {
      const result = await adminUpdateTicketStatusAction(ticketId, newStatus as never);
      if (result?.error) toast.error(result.error as string);
      else toast.success(`Status → ${newStatus.replace(/_/g, " ")}`);
    });
  };

  return (
    <div data-slot="admin-status-panel" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
      {actions.map((a) => (
        <Button key={a.next} onClick={() => update(a.next)} disabled={isPending} className={TONE[a.tone]}>
          {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {a.label}
        </Button>
      ))}
    </div>
  );
}
