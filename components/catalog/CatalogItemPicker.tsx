"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import { MIN_QUERY, stockAtStore, type CatalogItem, type StoreRef } from "@/lib/catalog/items";

/**
 * Search the company catalogue (Accurate, read through data.hnsitcenter.id) and
 * pick an item: the part that was fitted, or the unit that came in. Read only:
 * nothing here touches stock or writes to Accurate.
 */
export default function CatalogItemPicker({
  store = null,
  showStock = true,
  placeholder = "Cari nama barang atau SKU, mis. baterai asus",
  onPick,
}: {
  store?: StoreRef | null;
  /** Off for a customer's own unit: the shop's stock says nothing about it. */
  showStock?: boolean;
  placeholder?: string;
  onPick: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The query whose answer is on screen. Until it matches, a search is still on its way. */
  const [answered, setAnswered] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/catalog/items?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { items?: CatalogItem[]; error?: string };
        if (ticket !== latest.current) return; // a newer search has started
        setItems(body.items ?? []);
        setError(res.ok ? null : body.error ?? "Pencarian gagal.");
      } catch {
        if (ticket === latest.current) setError("Pencarian gagal. Periksa koneksi.");
      } finally {
        if (ticket === latest.current) {
          setLoading(false);
          setAnswered(q);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const short = query.trim().length < MIN_QUERY;
  // Busy from the first keystroke, not only once the request leaves: otherwise
  // "nothing matches" flashed during the debounce, before anything was asked.
  const busy = !short && (loading || answered !== query.trim());

  const clear = () => {
    latest.current++;
    setQuery("");
    setItems([]);
    setError(null);
    setLoading(false);
    setAnswered("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div data-slot="catalog-item-picker" className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
        {/* type="text", not "search": the browser's own clear cross sat exactly
            where the spinner spins, and the two overlapped. One slot, one icon. */}
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < MIN_QUERY) {
              setItems([]);
              setError(null);
            }
          }}
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-card py-1 pr-10 pl-9 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
          placeholder={placeholder}
          aria-label="Cari barang di katalog"
        />
        <span className="absolute top-1/2 right-1 flex -translate-y-1/2">
          {busy ? (
            <Loader2 aria-label="Mencari" className="m-2.5 size-4 animate-spin text-primary md:m-1.5" />
          ) : query ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Hapus pencarian"
              className="flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </span>
      </div>

      {busy && (
        <p className="text-xs text-muted-foreground">
          Mencari di katalog Accurate…
        </p>
      )}

      {error && !busy && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!short && !busy && !error && items.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Tidak ada barang yang cocok. Coba kata lain, atau tulis manual.
        </p>
      )}

      {!short && items.length > 0 && (
        <ul
          className="flex max-h-[260px] flex-col overflow-y-auto rounded-lg border border-border bg-card"
        >
          {items.map((item) => {
            const here = stockAtStore(item, store);
            return (
              <li key={item.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex min-h-11 w-full cursor-pointer flex-col gap-1 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="text-sm font-semibold text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    SKU {item.sku}
                    {item.category ? ` · ${item.category}` : ""}
                    {/* Service parts are ordered per job, so 0 is the normal case and
                        not worth showing; only RAM and SSD are kept in stock. */}
                    {!showStock
                      ? ""
                      : here !== null && here > 0
                        ? ` · stok toko ini ${here}`
                        : item.stockTotal > 0
                          ? ` · stok total ${item.stockTotal}`
                          : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
