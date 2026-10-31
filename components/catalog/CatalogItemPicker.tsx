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
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
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
          className="form-input"
          placeholder={placeholder}
          style={{ paddingLeft: "2.25rem", paddingRight: "2.5rem" }}
          aria-label="Cari barang di katalog"
        />
        <span style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", display: "flex" }}>
          {busy ? (
            <Loader2 size={16} aria-label="Mencari" style={{ animation: "spin 1s linear infinite", color: "var(--primary)", margin: "0.25rem" }} />
          ) : query ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Hapus pencarian"
              style={{ background: "none", border: 0, padding: "0.25rem", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
            >
              <X size={16} />
            </button>
          ) : null}
        </span>
      </div>

      {busy && (
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Mencari di katalog Accurate…
        </p>
      )}

      {error && !busy && <p className="form-error">{error}</p>}

      {!short && !busy && !error && items.length === 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Tidak ada barang yang cocok. Coba kata lain, atau tulis manual.
        </p>
      )}

      {!short && items.length > 0 && (
        <ul
          className="flex flex-col rounded-lg border"
          style={{ borderColor: "var(--border)", maxHeight: "260px", overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}
        >
          {items.map((item) => {
            const here = stockAtStore(item, store);
            return (
              <li key={item.id} style={{ borderTop: "1px solid var(--border-light)" }}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full flex-col gap-1 text-left hover:bg-[var(--cream)]"
                  style={{ background: "transparent", border: 0, cursor: "pointer", padding: "0.5rem 0.75rem" }}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.name}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
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
