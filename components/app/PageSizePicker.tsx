import Link from "next/link";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * "Tampilkan 10 / 25 / 50 per halaman". Links, like Pagination: the size is
 * part of the URL, so it survives paging, sorting, a filter chip and reload,
 * and works without JavaScript. Hidden when the list fits the smallest size.
 */
export function PageSizePicker({
  value,
  hrefForSize,
  totalItems,
  className,
}: {
  value: number;
  /** The list's own URL with this page size, back on page 1. */
  hrefForSize: (size: number) => string;
  totalItems: number;
  className?: string;
}) {
  if (totalItems <= PAGE_SIZE_OPTIONS[0]) return null;
  return (
    <div data-slot="page-size-picker" className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span aria-hidden="true">Tampilkan</span>
      <div role="group" aria-label="Jumlah baris per halaman" className="inline-flex gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {PAGE_SIZE_OPTIONS.map((n) => (
          <Link
            key={n}
            href={hrefForSize(n)}
            aria-current={n === value ? "true" : undefined}
            aria-label={`${n} per halaman`}
            className={cn(
              "inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:min-w-9",
              n === value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            {n}
          </Link>
        ))}
      </div>
      <span aria-hidden="true">per halaman</span>
    </div>
  );
}
