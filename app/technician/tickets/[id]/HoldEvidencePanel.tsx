"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import type { RmaHoldReason } from "@prisma/client";
import FileUpload from "@/components/ui/FileUpload";
import { submitHoldEvidenceAction } from "@/app/actions/rma";
import { RMA_HOLD_REASONS } from "@/lib/rma/hold-reason";
import { UploadCloud } from "lucide-react";

/**
 * What the RMA desk is waiting for, on the page of the person who can supply it.
 *
 * A held case used to be visible to the technician only as "verified →
 * on_hold" in a notification and a sentence on the case page they do not open.
 * So the desk chased it by hand, and a real case sat held with "VIDEO
 * KERUSAKAN BELUM DIKIRIMKAN" typed in capitals.
 *
 * Shown only while the case is held for a reason that names something the
 * technician has. Sending does not release the hold: the desk decides whether
 * what arrived is enough.
 */
export default function HoldEvidencePanel({
  ticketId,
  holdReasonCode,
  holdReason,
}: {
  ticketId: string;
  holdReasonCode: RmaHoldReason;
  holdReason: string | null;
}) {
  const meta = RMA_HOLD_REASONS[holdReasonCode];
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();

  if (!meta.asksTechnicianFor) return null;

  const submit = () => {
    const chosen = files.filter((f) => f.size > 0);
    if (chosen.length === 0) {
      toast.error(`Pilih dulu ${meta.asksTechnicianFor}.`);
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.append("ticket_id", ticketId);
      chosen.forEach((f) => fd.append("evidence_files", f));

      const res = await submitHoldEvidenceAction(fd);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      setFiles([]);
      toast.success("Terkirim. Tim RMA sudah diberi tahu.");
    });
  };

  return (
    <div
      className="card"
      style={{ borderColor: "#fde68a", background: "#fffbeb", padding: "1.25rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <UploadCloud size={18} style={{ color: "#92400e" }} />
        <h3 style={{ margin: 0, fontSize: "1rem", color: "#92400e" }}>Tim RMA Menunggu Kiriman Anda</h3>
      </div>

      <p style={{ fontSize: "0.875rem", color: "#92400e", margin: "0 0 0.25rem" }}>
        Klaim ini ditahan karena <strong>{meta.label.toLowerCase()}</strong>. Kirimkan{" "}
        <strong>{meta.asksTechnicianFor}</strong> agar prosesnya bisa dilanjutkan.
      </p>

      {holdReason && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
          Catatan tim RMA: {holdReason}
        </p>
      )}

      <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <FileUpload onChange={setFiles} accept={meta.accept ?? undefined} maxFiles={5} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={isPending || files.length === 0}
          >
            {isPending ? "Mengirim…" : "Kirim ke Tim RMA"}
          </button>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
          Mengirim tidak otomatis melepas penahanan — tim RMA yang memutuskan setelah melihatnya.
        </p>
      </div>
    </div>
  );
}
