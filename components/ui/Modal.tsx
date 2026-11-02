"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * The legacy modal, kept as an adapter over the shadcn Dialog.
 *
 * Same props as before, so the pages that still use it (some in work not yet
 * committed) get the Dialog's focus trap, Esc to close, scroll on short
 * screens and the 44px close button without being edited. The old version
 * locked body scroll by hand and closed only on a backdrop click. Delete once
 * nothing imports it.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "480px",
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-none"
        // The caller's width, never wider than the screen less a margin.
        style={{ maxWidth: `min(${maxWidth}, calc(100% - 2rem))` }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
