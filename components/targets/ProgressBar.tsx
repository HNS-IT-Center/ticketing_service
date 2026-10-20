import type { Progress } from "@/lib/reports/targets";

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
  const color = progress.met ? "#16a34a" : progress.percent >= 60 ? "#2563eb" : "#d97706";
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: "7rem" }}>
      <div
        role="progressbar"
        aria-valuenow={progress.value}
        aria-valuemax={progress.target}
        aria-label={`${progress.percent}% dari target`}
        style={{ height: "6px", borderRadius: "999px", background: "var(--border-light)", overflow: "hidden" }}
      >
        <div style={{ width: `${Math.min(100, progress.percent)}%`, height: "100%", background: color }} />
      </div>
      <span className="text-xs" style={{ color: progress.met ? "#166534" : "var(--text-muted)" }}>
        {progress.percent}% dari {format(progress.target)}
        {progress.met && " ✓"}
      </span>
    </div>
  );
}
