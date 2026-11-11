"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { liveSearchHref } from "@/lib/live-search";
import { cn } from "@/lib/utils";

/**
 * A filter dropdown inside a FilterBar form that applies itself as soon as a
 * value is picked: it rebuilds the URL from the whole form (search included)
 * and drops the page, like LiveSearchInput. An empty value means "all" and
 * leaves the key out of the URL. Without JavaScript the form's Search button
 * still submits it.
 */
export function AutoSubmitSelect({
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "onChange">) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      {...props}
      className={cn(pending && "opacity-70", className)}
      aria-busy={pending || undefined}
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        const href = liveSearchHref(form.getAttribute("action") || pathname, new FormData(form).entries());
        startTransition(() => router.replace(href, { scroll: false }));
      }}
    />
  );
}
