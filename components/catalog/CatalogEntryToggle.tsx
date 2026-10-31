"use client";

import { PenLine, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Switches an item field between searching the Accurate catalogue and typing a
 * name by hand. A button, not an underlined link: the owner found the link too
 * easy to miss (2026-10-27), and a unit that is not in the catalogue — bought
 * elsewhere, or not yet received in Accurate — is an everyday case.
 *
 * One look for every catalogue field: the create form's unit, PC build and
 * upgrade items, a part on the bill, and the technician's replaced parts.
 */
export default function CatalogEntryToggle({
  to,
  question,
  label,
  onClick,
}: {
  /** What the button switches to. */
  to: "manual" | "search";
  /** Shown before the button, e.g. "Unit tidak ada di katalog?". */
  question?: string;
  label: string;
  onClick: () => void;
}) {
  const Icon = to === "manual" ? PenLine : Search;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {question && (
        <span className="text-xs text-muted-foreground">
          {question}
        </span>
      )}
      <button
        type="button"
        className={buttonVariants({ variant: "outline", size: "sm", className: "bg-card" })}
        onClick={onClick}
      >
        <Icon aria-hidden="true" size={13} /> {label}
      </button>
    </div>
  );
}
