"use client";

import { History } from "lucide-react";

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
    <div
      className="flex flex-col gap-3 rounded-lg border p-4"
      style={{ borderColor: "#bfdbfe", background: "#eff6ff" }}
    >
      <div className="flex items-start gap-2">
        <History size={18} style={{ color: "#1d4ed8", flexShrink: 0, marginTop: 2 }} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold" style={{ color: "#1e3a8a" }}>
            Ada isian yang belum terkirim ({when})
          </p>
          <p className="text-xs" style={{ color: "#1e40af" }}>
            Pulihkan untuk melanjutkan dari yang terakhir diisi.
            {note ? ` ${note}` : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={onRestore}>
          Pulihkan
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onDiscard}>
          Mulai baru
        </button>
      </div>
    </div>
  );
}
