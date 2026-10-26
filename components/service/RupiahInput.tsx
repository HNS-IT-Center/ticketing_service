"use client";

import { useState } from "react";
import { groupDigits } from "@/lib/charges";

/**
 * A Rupiah amount box. Shows "150.000" as it is typed; the server reads the
 * same text with `parseRupiah`, so what is seen is what is saved. Empty means
 * "not filled in yet", which is kept apart from 0.
 */
export default function RupiahInput({
  name,
  defaultValue,
  placeholder = "belum diisi",
  label,
}: {
  name: string;
  defaultValue?: number | null;
  placeholder?: string;
  label: string;
}) {
  const [value, setValue] = useState(defaultValue == null ? "" : groupDigits(String(defaultValue)));
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="flex items-stretch">
        <span
          className="flex items-center rounded-l-md text-sm font-semibold"
          style={{ background: "var(--cream)", border: "1px solid var(--border-brand)", borderRight: "none", padding: "0 0.6rem" }}
        >
          Rp
        </span>
        <input
          name={name}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(groupDigits(e.target.value))}
          className="form-input min-w-0 flex-1"
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
        />
      </span>
    </label>
  );
}
