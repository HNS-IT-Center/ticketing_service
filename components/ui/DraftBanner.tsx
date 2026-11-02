"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";

/**
 * "You left something unfinished here — restore it?"
 *
 * Restoring is a choice rather than automatic: a draft from an abandoned
 * ticket must never quietly fill in the next customer's.
 */
export default function DraftBanner({
  savedAt,
  note,
  onRestore,
  onDiscard,
}: {
  savedAt: number;
  /** Anything the draft could not keep, e.g. files that must be picked again. */
  note?: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div data-slot="draft-banner" role="status" className={cn("flex flex-col gap-3 rounded-lg border px-4 py-3.5", TONE_CLASSES.blue)}>
      <div className="flex items-start gap-2">
        <History aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Ada isian yang belum terkirim ({when})</p>
          <p className="text-xs">
            Pulihkan untuk melanjutkan dari yang terakhir diisi.
            {note ? ` ${note}` : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onRestore}>
          Pulihkan
        </Button>
        <Button type="button" variant="outline" size="sm" className="bg-card" onClick={onDiscard}>
          Mulai baru
        </Button>
      </div>
    </div>
  );
}
