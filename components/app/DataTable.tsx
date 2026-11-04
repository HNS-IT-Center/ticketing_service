import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  /** A string, or a sort link; phone cards then use `mobileLabel`. */
  header: React.ReactNode;
  /** The label in the phone card when `header` is not plain text. */
  mobileLabel?: string;
  cell: (row: T) => React.ReactNode;
  /** Applied to the column's header and cells on desktop. */
  className?: string;
  /**
   * Where the column goes in the phone card:
   * `title` — bold, top left (usually the ticket code);
   * `badge` — top right (usually the status);
   * `detail` — a "header: value" line underneath (the default);
   * `footer` — full width at the bottom, unlabelled (an action button);
   * `hidden` — desktop only.
   */
  mobile?: "title" | "badge" | "detail" | "footer" | "hidden";
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Read by screen readers only; says what the table lists. */
  caption: string;
  /** Makes each row and card a link to the record; `undefined` leaves that one row unlinked. */
  rowHref?: (row: T) => string | undefined;
  /** Extra classes for one row and its card, e.g. dimming a row someone else holds. */
  rowClassName?: (row: T) => string | undefined;
  /** Shown instead of the table when `rows` is empty. */
  empty?: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  className?: string;
};

/**
 * A list of records: a table from `md` up, a stack of cards below it. Replaces
 * the `.admin-ticket-table` / `.admin-ticket-cards` pair, which wrote the same
 * list twice by hand on every page.
 *
 * Both layouts are rendered and CSS picks one, so the page needs no client JS
 * and no width check during render — nothing that could differ between the
 * server's HTML and the first client render (the H8 hydration rule).
 *
 * A server component on purpose: `cell` and `rowHref` are functions, which can
 * be handed to it from a server page but could not cross into a client one.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  rowHref,
  rowClassName,
  empty,
  loading = false,
  skeletonRows = 5,
  className,
}: DataTableProps<T>) {
  if (!loading && rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  const titleCols = columns.filter((c) => c.mobile === "title");
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const detailCols = columns.filter((c) => (c.mobile ?? "detail") === "detail");
  const footerCols = columns.filter((c) => c.mobile === "footer");
  // The first column carries the row link on desktop; the whole row is its
  // hit area through the stretched ::after.
  const linkKey = columns[0]?.key;

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)} aria-busy={loading || undefined}>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={cn("h-11 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                    {columns.map((col) => (
                      <TableCell key={col.key} className={cn("px-4 py-3", col.className)}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <TableRow
                      key={getRowKey(row)}
                      className={cn(href && "relative focus-within:bg-muted/50", rowClassName?.(row))}
                    >
                      {columns.map((col) => (
                        <TableCell key={col.key} className={cn("px-4 py-3 whitespace-normal text-foreground [overflow-wrap:anywhere]", col.className)}>
                          {href && col.key === linkKey ? (
                            <Link
                              href={href}
                              className="font-semibold text-primary outline-none after:absolute after:inset-0 hover:underline focus-visible:underline"
                            >
                              {col.cell(row)}
                            </Link>
                          ) : (
                            col.cell(row)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {loading
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <li key={`skeleton-${i}`} aria-hidden="true" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
              </li>
            ))
          : rows.map((row) => {
              const href = rowHref?.(row);
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5 font-semibold text-foreground">
                      {titleCols.map((col) => (
                        <span key={col.key} className="truncate">
                          {col.cell(row)}
                        </span>
                      ))}
                    </div>
                    {badgeCols.length > 0 && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {badgeCols.map((col) => (
                          <span key={col.key}>{col.cell(row)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {detailCols.length > 0 && (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                      {detailCols.map((col) => (
                        <div key={col.key} className="contents">
                          <dt className="text-muted-foreground">{col.mobileLabel ?? col.header}</dt>
                          <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">{col.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {footerCols.map((col) => (
                    <div key={col.key} className="flex flex-wrap items-center gap-2 *:flex-1">
                      {col.cell(row)}
                    </div>
                  ))}
                </>
              );
              const cardClass = cn(
                "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground",
                rowClassName?.(row),
              );
              return (
                <li key={getRowKey(row)}>
                  {href ? (
                    <Link
                      href={href}
                      className={cn(
                        cardClass,
                        "outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/50",
                      )}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={cardClass}>{content}</div>
                  )}
                </li>
              );
            })}
      </ul>
    </div>
  );
}
