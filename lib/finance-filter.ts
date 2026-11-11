/**
 * Finance's filters, read from the URL — shared by the pages and the Excel
 * export, so the file holds what is on screen.
 */
import { parsePeriod, wibDayKey, type Period } from "@/lib/store-dashboard";
import type { StoreClaimRow } from "@/lib/finance-claims-server";

export const CLAIM_STAGES = ["all", "at_vendor", "not_sent", "back"] as const;
export type ClaimStage = (typeof CLAIM_STAGES)[number];

export const CLAIM_STAGE_LABELS: Record<ClaimStage, string> = {
  all: "Semua",
  at_vendor: "Masih di vendor",
  not_sent: "Belum dikirim ke vendor",
  back: "Sudah kembali / selesai",
};

export function stageOfClaim(r: Pick<StoreClaimRow, "span" | "rmaStatus">): Exclude<ClaimStage, "all"> {
  if (r.span) return r.span.open ? "at_vendor" : "back";
  return r.rmaStatus === "closed" || r.rmaStatus === "cancelled" || r.rmaStatus === "ineligible" ? "back" : "not_sent";
}

export type FinanceSearch = {
  from?: string;
  to?: string;
  store?: string;
  vendor?: string;
  stage?: string;
  q?: string;
  page?: string;
  per?: string;
};

export type FinanceParams = {
  /** Claims sent to the vendor in this period. */
  period: Period;
  storeId?: string;
  vendorKey?: string;
  stage: ClaimStage;
  q: string;
};

const YEAR_MS = 365 * 24 * 3600_000;

/** The period defaults to the last twelve months: a payment term is a long view. */
export function readFinanceSearch(s: FinanceSearch, storeIds: readonly string[], now: number): FinanceParams {
  const period = parsePeriod(
    { period: "range", from: s.from || wibDayKey(now - YEAR_MS), to: s.to || wibDayKey(now) },
    now,
  );
  return {
    period,
    storeId: s.store && storeIds.includes(s.store) ? s.store : undefined,
    vendorKey: s.vendor?.trim() || undefined,
    stage: (CLAIM_STAGES as readonly string[]).includes(s.stage ?? "") ? (s.stage as ClaimStage) : "all",
    q: (s.q ?? "").trim().slice(0, 100),
  };
}

export function financeQuery(p: FinanceParams, defaults: { fromDay: string; toDay: string }, over: Record<string, string | undefined> = {}): string {
  const merged: Record<string, string | undefined> = {
    from: p.period.fromDay !== defaults.fromDay ? p.period.fromDay : undefined,
    to: p.period.toDay !== defaults.toDay ? p.period.toDay : undefined,
    store: p.storeId,
    vendor: p.vendorKey,
    stage: p.stage !== "all" ? p.stage : undefined,
    q: p.q || undefined,
    ...over,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
  return q.toString();
}
