"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LIVE_SEARCH_DELAY_MS, liveSearchHref } from "@/lib/live-search";

/**
 * A search box that filters as you type. The list pages search through the
 * URL (a GET form), so this only changes the URL — the server renders the
 * result, and Enter or the Search button still submit the form as before,
 * which keeps the box working without JavaScript.
 *
 * Uncontrolled on purpose: the server echoes the value back as
 * `defaultValue`, and a controlled input would fight the person typing. When
 * the value changes from outside (the "Clear" link) and the box is not being
 * typed in, it follows.
 */
export function LiveSearchInput({
  id,
  name = "q",
  defaultValue,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The input's own default never changes after the first render (Base UI
  // warns if it does); later values from the server are applied by the effect.
  const [initial] = useState(defaultValue);

  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el) el.value = defaultValue ?? "";
  }, [defaultValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const search = (el: HTMLInputElement) => {
    const form = el.form;
    let href: string;
    if (form) {
      href = liveSearchHref(form.getAttribute("action") || pathname, new FormData(form).entries());
    } else {
      const current = new URLSearchParams(window.location.search);
      current.set(name, el.value);
      href = liveSearchHref(pathname, current.entries());
    }
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <span className="relative block">
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        defaultValue={initial}
        aria-label={ariaLabel}
        className={cn("bg-card", pending && "pr-9", className)}
        onChange={(e) => {
          const el = e.currentTarget;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => search(el), LIVE_SEARCH_DELAY_MS);
        }}
      />
      {pending && (
        <Loader2
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? "Mencari…" : ""}
      </span>
    </span>
  );
}
