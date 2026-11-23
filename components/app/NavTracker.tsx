"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { forgetPrevious, recordVisit } from "@/lib/nav-memory";

/**
 * Records where this tab has been, for `BackButton` (lib/nav-memory.ts).
 * Renders nothing. In the root layout, under a Suspense boundary because it
 * reads the query string.
 */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);
  useEffect(() => {
    let store: Storage;
    try {
      store = window.sessionStorage;
    } catch {
      return;
    }
    if (first.current) {
      first.current = false;
      // A full page load from outside the app starts a fresh trail.
      if (!document.referrer.startsWith(window.location.origin)) forgetPrevious(store);
    }
    recordVisit(store, search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}
