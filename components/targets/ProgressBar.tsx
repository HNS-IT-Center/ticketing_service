import type { Progress } from "@/lib/reports/targets";
import { cn } from "@/lib/utils";

/**
 * How far one measure is toward its target. Renders nothing when that measure
 * has no target. Green once met; blue past 60%; amber below.
 */
export default function ProgressBar({
  progress,
  format = (n) => String(n),
}: {
  progress: Progress | null;
  format?: (n: number) => string;
}) {
  if (!progress) return null;
  const color = progress.met ? "bg-green-600" : progress.percent >= 60 ? "bg-blue-600" : "bg-amber-600";
  return (
    <div data-slot="target-progress" className="flex min-w-28 flex-col gap-1">
      <div
        role="progressbar"
        aria-valuenow={progress.value}
        aria-valuemax={progress.target}
        aria-label={`${progress.percent}% dari target`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full", color)} style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </div>
      <span className={cn("text-xs", progress.met ? "text-tone-green-fg" : "text-muted-foreground")}>
        {progress.percent}% dari {format(progress.target)}
        {progress.met && " ✓"}
      </span>
    </div>
  );
}
