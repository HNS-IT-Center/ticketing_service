"use client";

import { useState } from "react";
import { groupDigits } from "@/lib/charges";
import { Input } from "@/components/ui/input";

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
    <label data-slot="rupiah-input" className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-stretch">
        <span
          aria-hidden="true"
          className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-sm font-semibold text-muted-foreground"
        >
          Rp
        </span>
        <Input
          name={name}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(groupDigits(e.target.value))}
          className="min-w-0 flex-1 rounded-l-none bg-card"
        />
      </span>
    </label>
  );
}
