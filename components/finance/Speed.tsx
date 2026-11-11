import { speedOf, type Speed } from "@/lib/finance-claims";
import { cn } from "@/lib/utils";

const TONE: Record<Speed, string> = {
  ok: "border-border bg-muted text-foreground",
  slow: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg",
  very_slow: "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
};

/** A day count, coloured by how slow it is for a claim at a vendor. */
export function DaysPill({ days, suffix = "hari", className }: { days: number | null; suffix?: string; className?: string }) {
  if (days === null) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums", TONE[speedOf(days)], className)}>
      {days} {suffix}
    </span>
  );
}

export const LOCATION_LABEL = { in_town: "LKL", out_of_town: "ITR" } as const;
