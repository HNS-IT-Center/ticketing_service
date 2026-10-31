"use client";

import { useState } from "react";
import { PackageCheck, PenLine, X } from "lucide-react";
import CatalogItemPicker from "./CatalogItemPicker";
import CatalogEntryToggle from "./CatalogEntryToggle";
import { MAX_QUANTITY, type StoreRef } from "@/lib/catalog/items";
import { addPicked, MAX_ITEM_NAME, type PickedItem } from "@/lib/catalog/picked-items";

/**
 * A list of items picked from the company catalogue (Accurate, through
 * data.hnsitcenter.id), or typed when the catalogue does not hold one: the
 * components of a PC build, the item fitted for an upgrade.
 *
 * A picked item keeps its SKU, so a report can count it; a typed one keeps
 * only its words. Nothing is written to Accurate.
 */
export default function CatalogItemList({
  items,
  onChange,
  catalogEnabled,
  max,
  store = null,
  searchPlaceholder = "Cari barang di katalog, mis. rtx 4060",
  manualPlaceholder = "Nama barang, mis. Casing NZXT H5",
  addAnotherLabel = "Tambah barang lain",
}: {
  items: PickedItem[];
  onChange: (items: PickedItem[]) => void;
  catalogEnabled: boolean;
  max: number;
  /** The store the ticket is for, so the picker can show that store's stock. */
  store?: StoreRef | null;
  searchPlaceholder?: string;
  manualPlaceholder?: string;
  addAnotherLabel?: string;
}) {
  const [typing, setTyping] = useState(!catalogEnabled);
  const [typed, setTyped] = useState("");
  // With one item already on a one-item list, adding is closed; on a longer
  // list the picker folds away after each pick until it is asked for again.
  const [adding, setAdding] = useState(items.length === 0);
  const full = items.length >= max;

  const setQuantity = (index: number, raw: string) => {
    const n = Math.round(Number(raw));
    const quantity = Number.isFinite(n) ? Math.min(MAX_QUANTITY, Math.max(1, n)) : 1;
    onChange(items.map((item, i) => (i === index ? { ...item, quantity } : item)));
  };

  const addTyped = () => {
    const name = typed.trim();
    if (!name) return;
    onChange(addPicked(items, { catalogItemId: null, sku: null, category: null, name: name.slice(0, MAX_ITEM_NAME), quantity: 1 }));
    setTyped("");
    if (max > 1) setAdding(false);
  };

  const linkButton = (text: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: "var(--primary)",
        textDecoration: "underline",
        cursor: "pointer",
        padding: 0,
        fontSize: "0.8125rem",
        alignSelf: "flex-start",
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => {
        const picked = item.catalogItemId !== null;
        return (
          <div
            key={`${item.catalogItemId ?? "typed"}-${i}`}
            className="flex items-start justify-between gap-3 rounded-lg"
            style={{
              border: `1px solid ${picked ? "#bfdbfe" : "var(--border)"}`,
              background: picked ? "#eff6ff" : "var(--white)",
              padding: "0.625rem 0.75rem",
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold" style={{ wordBreak: "break-word" }}>
                {item.name}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {picked ? (
                  <>
                    <PackageCheck size={13} style={{ color: "#1e40af" }} />
                    SKU {item.sku}
                    {item.category ? ` · ${item.category}` : ""}
                  </>
                ) : (
                  <>
                    <PenLine size={13} />
                    Diketik manual — ditandai di laporan
                  </>
                )}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Qty
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  value={item.quantity}
                  onChange={(e) => setQuantity(i, e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="form-input"
                  style={{ width: "4rem", padding: "0.375rem 0.5rem" }}
                  aria-label={`Jumlah ${item.name}`}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const next = items.filter((_, n) => n !== i);
                  onChange(next);
                  if (next.length === 0) setAdding(true);
                }}
                aria-label={`Hapus ${item.name}`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}

      {!full && !adding && linkButton(`+ ${addAnotherLabel}`, () => setAdding(true))}

      {!full && adding && (
        <div className="flex flex-col gap-2">
          {catalogEnabled && !typing ? (
            <>
              <CatalogItemPicker
                store={store}
                placeholder={searchPlaceholder}
                onPick={(c) => {
                  onChange(addPicked(items, { catalogItemId: c.id, sku: c.sku, category: c.category, name: c.name, quantity: 1 }));
                  if (max > 1) setAdding(false);
                }}
              />
              <CatalogEntryToggle to="manual" question="Barang tidak ada di katalog?" label="Ketik manual" onClick={() => setTyping(true)} />
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input"
                  value={typed}
                  maxLength={MAX_ITEM_NAME}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTyped();
                    }
                  }}
                  placeholder={manualPlaceholder}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addTyped} disabled={!typed.trim()}>
                  Tambah
                </button>
              </div>
              {catalogEnabled && <CatalogEntryToggle to="search" label="Cari di katalog" onClick={() => setTyping(false)} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
