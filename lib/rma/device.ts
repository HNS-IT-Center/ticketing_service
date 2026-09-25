/**
 * Grouping claims by the device they are about.
 *
 * `Ticket.device_name` is free text, and it splits the same way vendor names
 * did: the live data holds "ASUS ROG G15", "ASUS ROG" and "Asus TUF A15" as
 * three separate strings. Grouping on the whole name therefore tells you
 * almost nothing.
 *
 * The brand — the first word — survives that. "ASUS ROG G15" and "Asus TUF A15"
 * are different models but the same manufacturer, and the manufacturer is what
 * a purchasing decision turns on.
 */

import type { DeviceType } from "@prisma/client";

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  PC_Office: "PC Office",
  PC_Gaming: "PC Gaming",
  Laptop_Office: "Laptop Office",
  Laptop_Gaming: "Laptop Gaming",
  Printer: "Printer",
  Other_Device: "Perangkat Lain",
};

/** First word of the device name, or "" when there is nothing to read. */
export function deviceBrand(deviceName: string | null | undefined): string {
  return (deviceName ?? "").trim().split(/\s+/)[0] ?? "";
}

export type BrandCount = { name: string; count: number };

/**
 * Count claims per brand, case-insensitively.
 *
 * The label is whichever spelling appears most often — so a brand written
 * "ASUS" four times and "Asus" once shows as "ASUS", without this module
 * needing a list of brand names to check against. Picking a casing rule
 * instead would get "iBox" and "HP" wrong in opposite directions.
 */
export function countByBrand(deviceNames: readonly (string | null)[]): BrandCount[] {
  const groups = new Map<string, Map<string, number>>();

  for (const name of deviceNames) {
    const brand = deviceBrand(name);
    if (!brand) continue;
    const key = brand.toLowerCase();
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(brand, (spellings.get(brand) ?? 0) + 1);
    groups.set(key, spellings);
  }

  return [...groups.values()]
    .map((spellings) => {
      let label = "";
      let best = -1;
      let count = 0;
      for (const [spelling, n] of spellings) {
        count += n;
        if (n > best) {
          best = n;
          label = spelling;
        }
      }
      return { name: label, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
