/**
 * The parts a service can replace — labels and ordering, in one place.
 *
 * Pure module: no database, no server imports, so the technician's panel, the
 * admin's read-only view and any future report all read the same list.
 *
 * The switch is exhaustive over the Prisma `ServicePart` enum via
 * `const _exhaustive: never`, the rule `lib/routes.ts` and
 * `components/rma/RmaStatusCard.tsx` already follow. Adding a part to the
 * schema without giving it a label fails `tsc` instead of rendering the raw
 * enum name on screen — which is exactly how "rma process" once reached a
 * customer's tracking page.
 */

import type { ServicePart } from "@prisma/client";

/**
 * How many photos one replaced part may carry.
 *
 * The habit this follows is photographing the box and the label, so two is the
 * normal case and five leaves room for the old component and the fitted one.
 * Matches `MAX_DAMAGE_PHOTOS` in `app/actions/rma.ts`, and the real ceiling
 * for either is `serverActions.bodySizeLimit`.
 */
export const MAX_PART_PHOTOS = 5;

/** Order shown in the picker: the common swaps first, `other` last. */
export const SERVICE_PART_ORDER: readonly ServicePart[] = [
  "lcd",
  "battery",
  "keyboard",
  "charger",
  "ram",
  "storage",
  "motherboard",
  "fan",
  "speaker",
  "casing",
  "other",
];

export function servicePartLabel(part: ServicePart): string {
  switch (part) {
    case "lcd":
      return "LCD / Layar";
    case "battery":
      return "Baterai";
    case "keyboard":
      return "Keyboard";
    case "charger":
      return "Charger / Adaptor";
    case "ram":
      return "RAM";
    case "storage":
      return "Penyimpanan (SSD / HDD)";
    case "motherboard":
      return "Motherboard";
    case "fan":
      return "Kipas / Pendingin";
    case "speaker":
      return "Speaker";
    case "casing":
      return "Casing / Bodi";
    case "other":
      return "Lainnya";
    default: {
      const _exhaustive: never = part;
      return String(_exhaustive);
    }
  }
}

/** True when the value really is one of the schema's parts. */
export function isServicePart(value: string): value is ServicePart {
  return (SERVICE_PART_ORDER as readonly string[]).includes(value);
}

/**
 * `other` says nothing on its own, so the item name carries the meaning and
 * stops being optional there. Every named part is already self-describing.
 */
export function requiresItemName(part: ServicePart): boolean {
  return part === "other";
}

/**
 * One line for a list or a report: the category, then what was actually
 * fitted. Free text is never shown alone — the category is what gives it
 * meaning, and what a count can group on.
 */
export function describeReplacedPart(part: ServicePart, itemName?: string | null): string {
  const label = servicePartLabel(part);
  const trimmed = itemName?.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}
