"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import type { RmaHoldReason } from "@prisma/client";
import FileUpload from "@/components/ui/FileUpload";
import { submitHoldEvidenceAction } from "@/app/actions/rma";
import { RMA_HOLD_REASONS } from "@/lib/rma/hold-reason";
import { UploadCloud } from "lucide-react";
import { uploadFailureMessage } from "@/lib/upload-limit";
import { Button } from "@/components/ui/button";
import { isNavigationSignal } from "@/lib/navigation-signal";

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

      let res: Awaited<ReturnType<typeof submitHoldEvidenceAction>>;
      try {
        res = await submitHoldEvidenceAction(fd);
      } catch (err) {
        // Next moving the page (e.g. the login ran out) is not a failure.
        if (isNavigationSignal(err)) return;
        console.error("[hold evidence] send failed:", err);
        toast.error(uploadFailureMessage(err));
        return;
      }
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setFiles([]);
      toast.success("Terkirim. Tim RMA sudah diberi tahu.");
    });
  };

  return (
    <section
      data-slot="hold-evidence-panel"
      aria-labelledby="hold-evidence-title"
      className="flex flex-col gap-3 rounded-xl border border-tone-amber-border bg-tone-amber-bg/50 p-5"
    >
      <div className="flex items-center gap-2 text-tone-amber-fg">
        <UploadCloud aria-hidden="true" className="size-[18px]" />
        <h3 id="hold-evidence-title" className="text-base font-semibold">Tim RMA Menunggu Kiriman Anda</h3>
      </div>

      <p className="text-sm text-tone-amber-fg">
        Klaim ini ditahan karena <strong>{meta.label.toLowerCase()}</strong>. Kirimkan{" "}
        <strong>{meta.asksTechnicianFor}</strong> agar prosesnya bisa dilanjutkan.
      </p>

      {holdReason && <p className="text-[0.8125rem] text-muted-foreground">Catatan tim RMA: {holdReason}</p>}

      {/* FileUpload is still a legacy component (Phase 3b). Inside a data-slot
          its paragraphs lose the legacy p rule, so give them the same size
          and line height here and it renders exactly as before. */}
      <div className="text-[0.9375rem] leading-[1.7]">
        <FileUpload onChange={setFiles} accept={meta.accept ?? undefined} maxFiles={5} />
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={isPending || files.length === 0} className="w-full sm:w-auto">
          {isPending ? "Mengirim…" : "Kirim ke Tim RMA"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Mengirim tidak otomatis melepas penahanan — tim RMA yang memutuskan setelah melihatnya.
      </p>
    </section>
  );
}
