"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { liveSearchHref } from "@/lib/live-search";

/** Long enough for a date typed digit by digit to settle into a whole date. */
const APPLY_DELAY_MS = 300;

/**
 * A FilterBar's GET form that applies itself: picking a store, a date, a
 * checkbox — any control — rebuilds the URL from the whole form and replaces
 * it, so nobody has to press a button. The search box (LiveSearchInput) and
 * the AutoSubmitSelects (`data-auto-submit`) do their own, so they are left
 * alone here. Without JavaScript it is an ordinary form: Enter submits it
 * through the hidden button.
 */
export function AutoFilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <form
      data-slot="filter-bar"
      role="search"
      method="get"
      action={action}
      aria-busy={pending || undefined}
      className={className}
      onChange={(e) => {
        const el = e.target as unknown as HTMLElement;
        if (el.dataset?.autoSubmit !== undefined) return;
        if (el instanceof HTMLInputElement && (el.type === "search" || el.type === "text")) return;
        const form = e.currentTarget;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const href = liveSearchHref(action || pathname, new FormData(form).entries());
          startTransition(() => router.replace(href, { scroll: false }));
        }, APPLY_DELAY_MS);
      }}
    >
      {children}
      <button type="submit" tabIndex={-1} aria-hidden="true" className="sr-only">
        Terapkan
      </button>
    </form>
  );
}
