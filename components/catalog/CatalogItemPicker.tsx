"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { MIN_QUERY, stockAtStore, type CatalogItem } from "@/lib/catalog/items";

/**
 * Search the company catalogue (Accurate, read through data.hnsitcenter.id) and
 * pick an item: the part that was fitted, or the unit that came in. Read only:
 * nothing here touches stock or writes to Accurate.
 */
export default function CatalogItemPicker({
  storeName = null,
  showStock = true,
  placeholder = "Cari nama barang atau SKU, mis. baterai asus",
  onPick,
}: {
  storeName?: string | null;
  /** Off for a customer's own unit: the shop's stock says nothing about it. */
  showStock?: boolean;
  placeholder?: string;
  onPick: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        if (ticket === latest.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const short = query.trim().length < MIN_QUERY;

  return (
    <div className="flex flex-col gap-2">
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          type="search"
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
          style={{ paddingLeft: "2.25rem" }}
          aria-label="Cari barang di katalog"
        />
        {loading && (
          <Loader2 size={15} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite", color: "var(--primary)" }} />
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!short && !loading && !error && items.length === 0 && (
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
            const here = stockAtStore(item, storeName);
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
