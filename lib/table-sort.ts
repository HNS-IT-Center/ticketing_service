/**
 * Ascending / descending on every table (owner, 2026-11-12). The order lives
 * in the URL as `?sort=<column>_<asc|desc>` — the format the ticket lists
 * already used — so it survives paging, reload and a shared link, and works
 * without JavaScript. A list paged by the database sorts there; a table that
 * is loaded whole (a report) sorts its rows here, with `sortRows`.
 */

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir };
export type SortValue = string | number | boolean | Date | null | undefined;

/** `"code_asc"` → `{ key: "code", dir: "asc" }`; anything not offered → the fallback. */
export function readSort(raw: string | null | undefined, keys: readonly string[], fallback: SortState): SortState {
  const m = /^(.+)_(asc|desc)$/.exec(raw ?? "");
  if (m && keys.includes(m[1])) return { key: m[1], dir: m[2] as SortDir };
  return fallback;
}

export function sortValue(s: SortState): string {
  return `${s.key}_${s.dir}`;
}

/**
 * What clicking a column's header asks for: the other direction when it is
 * the current column, else the column in `firstDir` — descending suits dates
 * and figures (newest, largest first), ascending names and codes.
 */
export function nextSort(current: SortState, key: string, firstDir: SortDir = "asc"): SortState {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue): number {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "boolean") a = a ? 1 : 0;
  if (typeof b === "boolean") b = b ? 1 : 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * The rows in the requested order, without touching the original array. Empty
 * values go last in both directions — a missing date is not "the oldest". Ties
 * keep their original order, so a report's own order is the tie-breaker.
 */
export function sortRows<T>(rows: readonly T[], s: SortState, values: Record<string, (row: T) => SortValue>): T[] {
  const get = values[s.key];
  if (!get) return [...rows];
  const sign = s.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      const xe = x.v === null || x.v === undefined || x.v === "";
      const ye = y.v === null || y.v === undefined || y.v === "";
      if (xe !== ye) return xe ? 1 : -1;
      return (xe ? 0 : sign * compare(x.v, y.v)) || x.i - y.i;
    })
    .map((x) => x.row);
}

/**
 * A link to the same page under another order: every other filter kept, the
 * page dropped (row 1 of a new order is not on page 4 of the old one), and the
 * parameter left out when it is the table's default.
 */
export function sortHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  s: SortState,
  opts: { param?: string; fallback?: SortState; pageParam?: string } = {},
): string {
  const param = opts.param ?? "sort";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === param || k === (opts.pageParam ?? "page") || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) if (one !== "") qs.append(k, one);
  }
  if (!opts.fallback || sortValue(opts.fallback) !== sortValue(s)) qs.set(param, sortValue(s));
  const str = qs.toString();
  return `${path}${str ? `?${str}` : ""}`;
}

/** The pieces a DataTable needs to draw sortable headers. */
export type TableSort = {
  state: SortState;
  href: (s: SortState) => string;
};

/** A DataTable sort for a page whose URL holds `param` (default `sort`). */
export function tableSort(
  path: string,
  params: Record<string, string | string[] | undefined>,
  state: SortState,
  opts: { param?: string; fallback?: SortState; pageParam?: string } = {},
): TableSort {
  return { state, href: (s) => sortHref(path, params, s, opts) };
}

/** The order a URL asks for, unchecked — a DataTable ignores a column it does not have. None = the table's own order. */
export function parseSort(raw: string | string[] | null | undefined): SortState {
  const m = /^(.+)_(asc|desc)$/.exec(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
  return m ? { key: m[1], dir: m[2] as SortDir } : { key: "", dir: "asc" };
}

/**
 * The sort for a table loaded whole: read from `param` (several tables on one
 * page each take their own, `sort_brand` …), linked back to `path` with every
 * other parameter kept. The DataTable sorts the rows by the columns' `sortValue`.
 */
export function urlSort(path: string, params: Record<string, string | string[] | undefined>, param = "sort"): TableSort {
  return tableSort(path, params, parseSort(params[param]), { param });
}
