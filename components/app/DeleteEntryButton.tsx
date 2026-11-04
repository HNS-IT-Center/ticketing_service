"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { errorOf } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The delete control of a Data Master row: a small red button, a confirmation,
 * and the server's refusal shown in the dialog when the entry is still in use.
 *
 * `blockedReason` disables it up front when the page already knows the entry
 * cannot go — a store with tickets, a vendor on a bill — so nobody confirms a
 * delete only to be told no. The server checks again either way.
 */
export function DeleteEntryButton({
  name,
  what,
  onDelete,
  blockedReason,
  description,
  className,
}: {
  /** The entry's name, as the dialog says it. */
  name: string;
  /** "vendor", "jasa", "toko" … */
  what: string;
  onDelete: () => Promise<unknown>;
  blockedReason?: string | null;
  description?: string;
  className?: string;
}) {
  const router = useRouter();
  const buttonClass = cn("bg-card text-destructive hover:bg-tone-red-bg hover:text-destructive", className);

  if (blockedReason) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title={blockedReason}
        aria-label={`Hapus ${name} — ${blockedReason}`}
        className={buttonClass}
      >
        <Trash2 aria-hidden="true" />
        <span className="md:sr-only">Hapus</span>
      </Button>
    );
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm" aria-label={`Hapus ${name}`} title={`Hapus ${what}`} className={buttonClass} />
      }
      triggerLabel={
        <>
          <Trash2 aria-hidden="true" />
          <span className="md:sr-only">Hapus</span>
        </>
      }
      title={`Hapus ${what} "${name}"?`}
      description={description ?? `${name} dihapus permanen dari daftar. Ini tidak bisa dibatalkan.`}
      confirmLabel="Hapus"
      variant="destructive"
      onConfirm={async () => {
        const error = errorOf(await onDelete());
        // Thrown so the dialog stays open and shows why.
        if (error) throw new Error(error);
        toast.success(`${name} dihapus.`);
        router.refresh();
      }}
    />
  );
}
