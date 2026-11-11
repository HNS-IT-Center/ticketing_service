/**
 * The Part Keluar filters, read from the URL — shared by the page and its
 * Excel export, so the file holds exactly what is on screen.
 */
import { parsePeriod, type Period } from "@/lib/store-dashboard";
import { isOutgoingKind, type OutgoingKind } from "@/lib/stock";

export type OutgoingSearch = {
  period?: string;
  from?: string;
  to?: string;
  store?: string;
  kind?: string;
  q?: string;
  uncoded?: string;
  page?: string;
  per?: string;
};

export type OutgoingParams = {
  period: Period;
  storeId?: string;
  kind?: OutgoingKind;
  q: string;
  uncoded: boolean;
};

export function readOutgoingSearch(s: OutgoingSearch, storeIds: readonly string[], now: number): OutgoingParams {
  return {
    period: parsePeriod({ period: s.period, from: s.from, to: s.to }, now),
    storeId: s.store && storeIds.includes(s.store) ? s.store : undefined,
    kind: isOutgoingKind(s.kind) ? s.kind : undefined,
    q: (s.q ?? "").trim().slice(0, 100),
    uncoded: s.uncoded === "1",
  };
}

/** The query string for these filters, with `over` applied; defaults are left out. */
export function outgoingQuery(p: OutgoingParams, over: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    period: p.period.preset !== "month" ? p.period.preset : undefined,
    from: p.period.preset === "range" ? p.period.fromDay : undefined,
    to: p.period.preset === "range" ? p.period.toDay : undefined,
    store: p.storeId,
    kind: p.kind,
    q: p.q || undefined,
    uncoded: p.uncoded ? "1" : undefined,
    ...over,
  };
  if (merged.period !== "range") {
    merged.from = undefined;
    merged.to = undefined;
  }
  for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
  return q.toString();
}
