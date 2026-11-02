"use client";

import { useId, useState } from "react";
import { PackageCheck, X } from "lucide-react";
import CatalogItemPicker from "./CatalogItemPicker";
import CatalogEntryToggle from "./CatalogEntryToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TONE_CLASSES } from "@/lib/status-display";
import { cn } from "@/lib/utils";

/** The unit as picked from the catalogue — what the intake form keeps and drafts. */
export type PickedUnit = { id: number; sku: string; name: string; category: string | null };

/**
 * The unit that came in for service, picked from the company catalogue
 * (Accurate, through data.hnsitcenter.id) or typed when it is not there — a
 * unit bought elsewhere, or an old model.
 *
 * Picked, the ticket records the catalogue's name and SKU, which a report can
 * count; typed, it records the words. Nothing is written to Accurate: what is
 * entered here stays in this system.
 */
export default function UnitField({
  catalogEnabled,
  unit,
  onUnitChange,
  name,
  onNameChange,
  label,
  optional = true,
  placeholder = "Misal: ASUS ROG G15",
}: {
  catalogEnabled: boolean;
  unit: PickedUnit | null;
  onUnitChange: (unit: PickedUnit | null) => void;
  /** The device name the ticket stores; set to the catalogue name when picked. */
  name: string;
  onNameChange: (name: string) => void;
  label: string;
  optional?: boolean;
  placeholder?: string;
}) {
  // Typing is chosen explicitly, or implied by a typed name already there
  // (a restored draft). Switching back to search clears the typed name, so a
  // hidden name can never ride along unseen.
  const [typing, setTyping] = useState(false);
  const mode = unit ? "picked" : !catalogEnabled || typing || name.trim() ? "manual" : "search";
  const inputId = useId();

  // A real <label> only when there is one box to point it at (typing); the
  // picker and the picked card are named by the same words as a heading.
  const LabelTag = mode === "manual" ? "label" : "span";
  const labelEl = (
    <LabelTag {...(mode === "manual" ? { htmlFor: inputId } : {})} className="text-sm font-medium text-foreground">
      {label}{" "}
      {optional && <span className="font-normal text-muted-foreground">(opsional)</span>}
    </LabelTag>
  );

  if (mode === "picked" && unit) {
    return (
      <div data-slot="unit-field" className="flex min-w-0 flex-col gap-1.5">
        {labelEl}
        <div className={cn("flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3", TONE_CLASSES.blue)}>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold [overflow-wrap:anywhere]">{unit.name}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <PackageCheck aria-hidden="true" className="size-[13px] text-blue-800 dark:text-blue-300" />
              SKU {unit.sku}
              {unit.category ? ` · ${unit.category}` : ""} · dari katalog Accurate
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onUnitChange(null);
              onNameChange("");
              setTyping(false);
            }}
            aria-label="Ganti unit"
            className="shrink-0"
          >
            <X aria-hidden="true" /> Ganti
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "search") {
    return (
      <div data-slot="unit-field" className="flex min-w-0 flex-col gap-2">
        {labelEl}
        <CatalogItemPicker
          showStock={false}
          placeholder="Cari unit di katalog, mis. asus vivobook 14"
          onPick={(item) => {
            onUnitChange({ id: item.id, sku: item.sku, name: item.name, category: item.category });
            onNameChange(item.name);
          }}
        />
        <CatalogEntryToggle to="manual" question="Unit tidak ada di katalog?" label="Ketik manual" onClick={() => setTyping(true)} />
      </div>
    );
  }

  return (
    <div data-slot="unit-field" className="flex min-w-0 flex-col gap-2">
      {labelEl}
      <Input
        id={inputId}
        className="bg-card"
        value={name}
        onChange={(e) => {
          // Pinned once someone types, so clearing the box to retype does not
          // swap it for the search under their fingers.
          setTyping(true);
          onNameChange(e.target.value);
        }}
        placeholder={placeholder}
      />
      {catalogEnabled && (
        <CatalogEntryToggle
          to="search"
          label="Cari di katalog Accurate"
          onClick={() => {
            onNameChange("");
            setTyping(false);
          }}
        />
      )}
    </div>
  );
}
