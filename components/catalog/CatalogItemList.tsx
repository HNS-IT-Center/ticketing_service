"use client";

import { useState } from "react";
import { PackageCheck, PenLine, X } from "lucide-react";
import CatalogItemPicker from "./CatalogItemPicker";
import CatalogEntryToggle from "./CatalogEntryToggle";
import { MAX_QUANTITY, type StoreRef } from "@/lib/catalog/items";
import { addPicked, MAX_ITEM_NAME, type PickedItem } from "@/lib/catalog/picked-items";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";

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
      className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-sm text-[0.8125rem] text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0"
    >
      {text}
    </button>
  );

  return (
    <div data-slot="catalog-item-list" className="flex flex-col gap-2">
      {items.map((item, i) => {
        const picked = item.catalogItemId !== null;
        return (
          <div
            key={`${item.catalogItemId ?? "typed"}-${i}`}
            className={cn(
              "flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5",
              picked ? TONE_CLASSES.blue : "border-border bg-card"
            )}
          >
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
              <span className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{item.name}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {picked ? (
                  <>
                    <PackageCheck aria-hidden="true" className="size-[13px] text-blue-800 dark:text-blue-300" />
                    SKU {item.sku}
                    {item.category ? ` · ${item.category}` : ""}
                  </>
                ) : (
                  <>
                    <PenLine aria-hidden="true" className="size-[13px]" />
                    Diketik manual — ditandai di laporan
                  </>
                )}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Qty
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  value={item.quantity}
                  onChange={(e) => setQuantity(i, e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-16 bg-card px-2"
                  aria-label={`Jumlah ${item.name}`}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = items.filter((_, n) => n !== i);
                  onChange(next);
                  if (next.length === 0) setAdding(true);
                }}
                aria-label={`Hapus ${item.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X aria-hidden="true" />
              </Button>
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
                <Input
                  type="text"
                  className="min-w-0 flex-1 bg-card"
                  aria-label={manualPlaceholder}
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
                <button
                  type="button"
                  className={buttonVariants({ variant: "outline", className: "h-11 shrink-0 bg-card md:h-9" })}
                  onClick={addTyped}
                  disabled={!typed.trim()}
                >
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
