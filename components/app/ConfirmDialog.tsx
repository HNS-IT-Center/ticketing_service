"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ConfirmDialogProps = {
  /** The control that opens the dialog, e.g. `<Button variant="destructive" />`. */
  trigger: React.ReactElement;
  /** The trigger's own text. */
  triggerLabel: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `destructive` paints the confirm button red: deleting, cancelling, rejecting. */
  variant?: "default" | "destructive";
  /**
   * Runs on confirm. The dialog stays open, with both buttons locked, until it
   * settles; it closes on success and shows the error's message on failure,
   * so a rejected server action is never silently swallowed.
   */
  onConfirm: () => Promise<void> | void;
};

/**
 * "Are you sure?" before anything that cannot be undone. Replaces
 * `window.confirm`, which cannot be styled, read out properly, or show what
 * went wrong afterwards.
 */
export function ConfirmDialog({
  trigger,
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      <DialogContent showCloseButton={!pending} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded-lg bg-tone-red-bg px-3 py-2 text-sm text-tone-red-fg">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{cancelLabel}</DialogClose>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            className={variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={confirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
