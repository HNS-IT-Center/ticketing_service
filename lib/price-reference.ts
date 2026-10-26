/**
 * What a part usually sells for — a guide for whoever sets a selling price.
 *
 * Service parts are not stocked: they are bought per job from suppliers, the
 * price agreed in the supplier chat, and marked up on the spot. So there is no
 * list price and no cost in Accurate to start from, and the same battery could
 * be sold for different prices by different technicians. This reads the shop's
 * own past bills instead: the prices this item, or this kind of part, actually
 * went out at. A guide, not a rule — nothing here sets or refuses a price.
 *
 * Pure: the samples are passed in.
 */

import type { ServicePart } from "@prisma/client";
import { servicePartLabel } from "@/lib/service-parts";

/** How many of the most recent sales a reference is drawn from. */
export const REFERENCE_SAMPLES = 10;
/** A whole category is broad; it needs a few sales before it says anything. */
export const CATEGORY_MIN_SAMPLES = 3;

export type PriceSample = {
  chargeId: string;
  part: ServicePart;
  sku: string | null;
  name: string | null;
  price: number;
  at: Date;
};

export type PriceTarget = { chargeId: string; part: ServicePart; sku: string | null; name: string | null };

export type PriceReference = {
  /** What it was matched on, most specific first. */
  basis: "sku" | "name" | "category";
  /** In words, for the screen: "barang yang sama", "semua Baterai". */
  label: string;
  count: number;
  min: number;
  max: number;
  median: number;
  last: number;
  lastAt: string;
};

/** Typed names compared the way the reports compare them: case and spacing ignored. */
export function nameKey(name: string | null | undefined): string | null {
  const key = name?.replace(/\s+/g, " ").trim().toLowerCase();
  return key ? key : null;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function summarize(basis: PriceReference["basis"], label: string, picked: PriceSample[]): PriceReference {
  const prices = picked.map((s) => s.price).sort((a, b) => a - b);
  return {
    basis,
    label,
    count: picked.length,
    min: prices[0],
    max: prices[prices.length - 1],
    median: median(prices),
    last: picked[0].price,
    lastAt: picked[0].at.toISOString(),
  };
}

/**
 * The reference for one part line, from the most specific match that has
 * enough sales: the same catalogue item, else the same typed name in the same
 * category, else the category as a whole. The line itself never counts.
 */
export function priceReference(target: PriceTarget, samples: readonly PriceSample[]): PriceReference | null {
  const others = samples.filter((s) => s.chargeId !== target.chargeId).sort((a, b) => b.at.getTime() - a.at.getTime());
  const recent = (match: (s: PriceSample) => boolean) => others.filter(match).slice(0, REFERENCE_SAMPLES);

  if (target.sku) {
    const bySku = recent((s) => s.sku === target.sku);
    if (bySku.length > 0) return summarize("sku", "barang yang sama", bySku);
  }
  const key = nameKey(target.name);
  if (!target.sku && key) {
    const byName = recent((s) => !s.sku && s.part === target.part && nameKey(s.name) === key);
    if (byName.length > 0) return summarize("name", "nama barang yang sama", byName);
  }
  const byCategory = recent((s) => s.part === target.part);
  if (byCategory.length >= CATEGORY_MIN_SAMPLES) {
    return summarize("category", `semua ${servicePartLabel(target.part)}`, byCategory);
  }
  return null;
}
