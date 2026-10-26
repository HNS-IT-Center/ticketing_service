"use client";

import { useState } from "react";
import { PackageCheck, X } from "lucide-react";
import CatalogItemPicker from "./CatalogItemPicker";

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

  const labelEl = (
    <label className="form-label">
      {label}{" "}
      {optional && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opsional)</span>}
    </label>
  );

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

  if (mode === "picked" && unit) {
    return (
      <div className="form-group">
        {labelEl}
        <div
          className="flex items-start justify-between gap-3 rounded-lg"
          style={{ border: "1px solid #bfdbfe", background: "#eff6ff", padding: "0.75rem 0.875rem" }}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold" style={{ wordBreak: "break-word" }}>
              {unit.name}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <PackageCheck size={13} style={{ color: "#1e40af" }} />
              SKU {unit.sku}
              {unit.category ? ` · ${unit.category}` : ""} · dari katalog Accurate
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onUnitChange(null);
              onNameChange("");
              setTyping(false);
            }}
            aria-label="Ganti unit"
          >
            <X size={14} /> Ganti
          </button>
        </div>
      </div>
    );
  }

  if (mode === "search") {
    return (
      <div className="form-group flex flex-col gap-2">
        {labelEl}
        <CatalogItemPicker
          showStock={false}
          placeholder="Cari unit di katalog, mis. asus vivobook 14"
          onPick={(item) => {
            onUnitChange({ id: item.id, sku: item.sku, name: item.name, category: item.category });
            onNameChange(item.name);
          }}
        />
        {linkButton("Unit tidak ada di katalog? Ketik manual", () => setTyping(true))}
      </div>
    );
  }

  return (
    <div className="form-group flex flex-col gap-2">
      {labelEl}
      <input
        className="form-input"
        value={name}
        onChange={(e) => {
          // Pinned once someone types, so clearing the box to retype does not
          // swap it for the search under their fingers.
          setTyping(true);
          onNameChange(e.target.value);
        }}
        placeholder={placeholder}
      />
      {catalogEnabled &&
        linkButton("Cari di katalog Accurate", () => {
          onNameChange("");
          setTyping(false);
        })}
    </div>
  );
}
