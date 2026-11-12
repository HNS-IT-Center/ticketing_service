import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { nextSort, sortRows, type SortDir, type SortValue, type TableSort } from "@/lib/table-sort";

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
  /**
   * The cell holds its own controls (a delete button …). On a linked row they
   * sit above the row's link instead of under it, and on a phone they are put
   * below the card's link rather than inside it — a button inside a link is
   * neither valid nor reliably clickable.
   */
  interactive?: boolean;
  /**
   * The table's `sort` key for this column; with `sort` set on the table the
   * header becomes a link that switches between ascending and descending.
   */
  sortKey?: string;
  /** The direction of the first click: `desc` suits dates and figures. Default `asc`. */
  sortFirst?: SortDir;
  /**
   * For a table loaded whole: the value the column sorts by. The table then
   * sorts its own rows when this column is the active one, and `sortKey`
   * defaults to `key`. A list paged by the database leaves this out and sorts
   * in its query instead.
   */
  sortValue?: (row: T) => SortValue;
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
  /** The current order and how to link to another (lib/table-sort.ts). */
  sort?: TableSort;
  /**
   * For a list paged in memory: hand over every row and the page's
   * `[start, end)`. The rows are sorted first and cut after, so the order
   * covers the whole list, not just the page on screen.
   */
  window?: [number, number];
};

/** The column's name as plain text, for the phone sort row and aria labels. */
function labelOf<T>(col: DataTableColumn<T>): string {
  return col.mobileLabel ?? (typeof col.header === "string" ? col.header : col.key);
}

function SortIcon({ dir }: { dir?: SortDir }) {
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", !dir && "opacity-40")} />;
}

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
  columns: givenColumns,
  rows: givenRows,
  getRowKey,
  caption,
  rowHref,
  rowClassName,
  empty,
  loading = false,
  skeletonRows = 5,
  className,
  sort,
  window: pageWindow,
}: DataTableProps<T>) {
  const columns = givenColumns.map((c) => (c.sortValue && !c.sortKey ? { ...c, sortKey: c.key } : c));
  const active = sort ? columns.find((c) => c.sortKey === sort.state.key && c.sortValue) : undefined;
  const ordered = active ? sortRows(givenRows, sort!.state, { [sort!.state.key]: active.sortValue! }) : givenRows;
  const rows = pageWindow ? ordered.slice(pageWindow[0], pageWindow[1]) : ordered;

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
  const sortable = sort ? columns.filter((c) => c.sortKey) : [];
  const dirOf = (col: DataTableColumn<T>) => (sort && col.sortKey === sort.state.key ? sort.state.dir : undefined);

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
                  aria-sort={dirOf(col) === "asc" ? "ascending" : dirOf(col) === "desc" ? "descending" : undefined}
                  className={cn("h-11 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase", col.className)}
                >
                  {sort && col.sortKey ? (
                    <Link
                      href={sort.href(nextSort(sort.state, col.sortKey, col.sortFirst))}
                      scroll={false}
                      title={`Urutkan menurut ${labelOf(col)}`}
                      className={cn(
                        "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-1 uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                        dirOf(col) && "text-foreground",
                      )}
                    >
                      {col.header}
                      <SortIcon dir={dirOf(col)} />
                    </Link>
                  ) : (
                    col.header
                  )}
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
                          {href && col.interactive ? (
                            <div className="relative z-10">{col.cell(row)}</div>
                          ) : href && col.key === linkKey ? (
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

      {sortable.length > 0 && rows.length > 1 && (
        <nav aria-label="Urutkan" className="flex flex-wrap items-center gap-1.5 md:hidden">
          <span className="text-xs text-muted-foreground">Urutkan:</span>
          {sortable.map((col) => {
            const dir = dirOf(col);
            return (
              <Link
                key={col.key}
                href={sort!.href(nextSort(sort!.state, col.sortKey!, col.sortFirst))}
                scroll={false}
                aria-current={dir ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  dir ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                )}
              >
                {labelOf(col)}
                <SortIcon dir={dir} />
              </Link>
            );
          })}
        </nav>
      )}

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
                  {footerCols
                    .filter((col) => !(href && col.interactive))
                    .map((col) => (
                      <div key={col.key} className="flex flex-wrap items-center gap-2 *:flex-1">
                        {col.cell(row)}
                      </div>
                    ))}
                </>
              );
              const controls = href ? footerCols.filter((col) => col.interactive) : [];
              const cardClass = cn(
                "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground",
                rowClassName?.(row),
              );
              return (
                <li key={getRowKey(row)}>
                  {href && controls.length > 0 ? (
                    // The link stretches over the card through its ::after; the
                    // controls sit above it, outside the link.
                    <div className={cn(cardClass, "relative transition-colors hover:border-primary/40 focus-within:ring-3 focus-within:ring-ring/50")}>
                      <Link href={href} className="flex flex-col gap-3 outline-none after:absolute after:inset-0">
                        {content}
                      </Link>
                      {controls.map((col) => (
                        <div key={col.key} className="relative z-10 flex flex-wrap items-center gap-2 *:flex-1">
                          {col.cell(row)}
                        </div>
                      ))}
                    </div>
                  ) : href ? (
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
