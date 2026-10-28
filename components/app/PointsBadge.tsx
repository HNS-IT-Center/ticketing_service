import { cn } from "@/lib/utils";

/** "5 pts" — the points a ticket is worth, as the ticket lists show it. */
export function PointsBadge({ points, className }: { points: number; className?: string }) {
  return (
    <span
      data-slot="points-badge"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-tone-blue-border bg-tone-blue-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-tone-blue-fg tabular-nums",
        className,
      )}
    >
      {points} pts
    </span>
  );
}
