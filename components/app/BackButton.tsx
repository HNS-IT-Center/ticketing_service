"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { backTarget } from "@/lib/nav-memory";
import { cn } from "@/lib/utils";

/**
 * "Kembali" on a detail page. Goes back to the list the person came from with
 * the filters they had set — the browser's own back when the previous page in
 * this tab is one of ours, else `fallback` with the filters last used on it.
 * A link to `fallback` without JavaScript.
 */
export function BackButton({
  fallback,
  label = "Kembali",
  className,
}: {
  /** The list this page belongs to, e.g. "/admin/tickets". */
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <a
      data-slot="back-button"
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        let target: ReturnType<typeof backTarget> = { kind: "href", href: fallback };
        try {
          target = backTarget(window.sessionStorage, window.location.pathname + window.location.search, fallback, window.history.length);
        } catch {
          // No storage: the plain list.
        }
        if (target.kind === "history") router.back();
        else router.push(target.href);
      }}
      className={cn(
        "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-primary hover:underline md:min-h-8",
        className,
      )}
    >
      <ArrowLeft aria-hidden className="size-4" /> {label}
    </a>
  );
}
