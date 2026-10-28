import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatCardTone = "default" | "attention" | "success";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** One line under the value: a comparison, a unit, a reason. */
  hint?: React.ReactNode;
  /**
   * `attention` is for a count that asks someone to act ("Perlu Perhatian");
   * it turns the value red only when it is not zero, so an empty queue reads
   * as calm.
   */
  tone?: StatCardTone;
  /** Makes the whole card a link to the list behind the number. */
  href?: string;
  className?: string;
};

const ICON_TONE: Record<StatCardTone, string> = {
  default: "bg-secondary text-primary",
  attention: "bg-tone-red-bg text-tone-red-fg",
  success: "bg-tone-green-bg text-tone-green-fg",
};

export function StatCard({ label, value, icon: Icon, hint, tone = "default", href, className }: StatCardProps) {
  const urgent = tone === "attention" && value !== 0 && value !== "0";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
            <Icon aria-hidden="true" className="size-4.5" />
          </span>
        )}
      </div>
      <span
        className={cn(
          "text-2xl leading-none font-bold tabular-nums md:text-3xl",
          urgent ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );

  const classes = cn(
    "flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs md:p-5",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        data-slot="stat-card"
        className={cn(
          classes,
          "outline-none transition-shadow hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-slot="stat-card" className={classes}>
      {body}
    </div>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="stat-card"
      aria-hidden="true"
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5", className)}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}
