import Link from "next/link";
import { ChevronRight, ClipboardCheck, Clock, Package, Receipt, Truck, Wrench, type LucideIcon } from "lucide-react";
import { FOLLOWUP_INFO, FOLLOWUP_KINDS, type FollowupKind, type Urgency } from "@/lib/store-followups";
import type { Followups } from "@/lib/store-followups-server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const FOLLOWUP_ICONS: Record<FollowupKind, LucideIcon> = {
  stale: Clock,
  pickup: Package,
  vendor: Truck,
  billing: Receipt,
  code: Wrench,
};

export const URGENCY_PILL: Record<Urgency, string> = {
  ok: "border-border bg-muted text-foreground",
  warn: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg",
  overdue: "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
};

/** "?store=…" kept on every link, so the chosen store follows the viewer. */
export function followupHref(kind: FollowupKind, store?: string) {
  const q = new URLSearchParams({ jenis: kind });
  if (store) q.set("store", store);
  return `/toko/tindak-lanjut?${q}`;
}

/**
 * The dashboard's "Perlu ditindaklanjuti": one row per list — how many, how
 * many past their limit, the longest wait — each opening its full list.
 */
export function FollowupCard({ followups, store }: { followups: Followups; store?: string }) {
  return (
    <Card data-slot="followup-card" className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck aria-hidden className="size-4 text-primary" /> Perlu ditindaklanjuti
        </CardTitle>
        <CardDescription>Yang perlu dikejar hari ini. Buka untuk daftar lengkapnya.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {FOLLOWUP_KINDS.map((kind) => {
          const items = followups[kind];
          const overdue = items.filter((i) => i.urgency === "overdue").length;
          const worst: Urgency = overdue ? "overdue" : items.some((i) => i.urgency === "warn") ? "warn" : "ok";
          const Icon = FOLLOWUP_ICONS[kind];
          return (
            <Link
              key={kind}
              href={followupHref(kind, store)}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{FOLLOWUP_INFO[kind].label}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length === 0
                    ? "Tidak ada"
                    : `terlama ${items[0].days} hari${overdue ? ` · ${overdue} lewat ${FOLLOWUP_INFO[kind].overdueDays} hari` : ""}`}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums",
                  items.length ? URGENCY_PILL[worst] : URGENCY_PILL.ok,
                )}
              >
                {items.length}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
