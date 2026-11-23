/**
 * Where a "Kembali" button should go — the list someone came from, with the
 * filters they set there.
 *
 * Every list keeps its filters in the URL, so remembering the URL is enough.
 * `NavTracker` (root layout) records the previous and current address of this
 * tab, and the last address seen on each path; `BackButton` reads them. Kept in
 * sessionStorage: per tab, gone when the tab closes, never sent anywhere.
 *
 * Pure apart from the storage it is given, so it is tested without a browser.
 */

export type NavStore = Pick<Storage, "getItem" | "setItem">;

const PREV = "nav:prev";
const CURR = "nav:curr";
const lastKey = (path: string) => `nav:last:${path}`;

/** "/admin/tickets?status=done" → "/admin/tickets". */
export function pathOf(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function read(store: NavStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: NavStore, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    // Private mode or storage full: the button falls back to the plain list.
  }
}

/** Record that this tab is now on `url` (path + query). */
export function recordVisit(store: NavStore, url: string) {
  const curr = read(store, CURR);
  if (curr !== url) {
    // The same page with other filters is not a step back: a filter change
    // replaces the address rather than adding one.
    if (curr && pathOf(curr) !== pathOf(url)) write(store, PREV, curr);
    write(store, CURR, url);
  }
  write(store, lastKey(pathOf(url)), url);
}

/**
 * The tab arrived from outside the app (a pasted link, another site): its
 * previous page is not one of ours, so "Kembali" must not step back into it.
 */
export function forgetPrevious(store: NavStore) {
  write(store, PREV, "");
}

/**
 * Where "Kembali" goes from the page now on screen:
 * - `history` — the previous page of this tab is another page of the app, so
 *   the browser's own back restores it exactly, filters and scroll included;
 * - otherwise the fallback list, with the filters last used on it in this tab.
 */
export function backTarget(
  store: NavStore,
  current: string,
  fallback: string,
  historyLength: number,
): { kind: "history" } | { kind: "href"; href: string } {
  const prev = read(store, PREV);
  if (historyLength > 1 && prev && pathOf(prev) !== pathOf(current)) return { kind: "history" };
  const remembered = read(store, lastKey(pathOf(fallback)));
  return { kind: "href", href: remembered ?? fallback };
}
