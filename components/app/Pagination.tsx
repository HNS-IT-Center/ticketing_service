import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { nextPage, pageWindow, previousPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type PaginationProps = {
  /** 1-based. */
  page: number;
  pageCount: number;
  /** Builds the link for a page, keeping the list's other query params. */
  hrefForPage: (page: number) => string;
  /** With both set, "21–40 dari 134" is shown beside the controls. */
  totalItems?: number;
  pageSize?: number;
  className?: string;
};

/**
 * Links, not buttons: each page is a URL, so it works without JavaScript and
 * the back button behaves. A page past the end still renders the controls,
 * so there is always a way back — the fault BL28 found on `/rma/logs`.
 */
export function Pagination({ page, pageCount, hrefForPage, totalItems, pageSize, className }: PaginationProps) {
  if (pageCount <= 1 && page <= 1) return null;

  const prev = previousPage(page, pageCount);
  const next = nextPage(page, pageCount);
  const showRange = totalItems !== undefined && pageSize !== undefined && totalItems > 0;
  const from = showRange ? Math.min((page - 1) * pageSize + 1, totalItems) : 0;
  const to = showRange ? Math.min(page * pageSize, totalItems) : 0;

  const stepClass = cn(buttonVariants({ variant: "outline", size: "default" }), "gap-1 bg-card");
  const disabledStep = cn(stepClass, "pointer-events-none opacity-50");

  return (
    <nav
      data-slot="pagination"
      aria-label="Halaman"
      className={cn("flex flex-col items-center gap-3 sm:flex-row sm:justify-between", className)}
    >
      {showRange ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          {from}–{to} dari {totalItems}
        </p>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        {prev !== null ? (
          <Link href={hrefForPage(prev)} className={stepClass} aria-label="Halaman sebelumnya" rel="prev">
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">Sebelumnya</span>
          </Link>
        ) : (
          <span className={disabledStep} aria-hidden="true">
            <ChevronLeft />
            <span className="hidden sm:inline">Sebelumnya</span>
          </span>
        )}

        <span className="px-3 text-sm text-muted-foreground tabular-nums sm:hidden">
          {page} / {pageCount}
        </span>

        <ol className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={hrefForPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Halaman ${p}`}
                  className={cn(
                    buttonVariants({ variant: p === page ? "default" : "ghost", size: "icon" }),
                    "tabular-nums",
                  )}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
        </ol>

        {next !== null ? (
          <Link href={hrefForPage(next)} className={stepClass} aria-label="Halaman berikutnya" rel="next">
            <span className="hidden sm:inline">Berikutnya</span>
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <span className={disabledStep} aria-hidden="true">
            <span className="hidden sm:inline">Berikutnya</span>
            <ChevronRight />
          </span>
        )}
      </div>
    </nav>
  );
}
