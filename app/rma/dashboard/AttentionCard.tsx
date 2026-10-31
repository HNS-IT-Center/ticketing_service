import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { RmaQueueRow, RmaSeverity } from "@/lib/rma/queue";
import { cn } from "@/lib/utils";

/** How many rows a card shows before the rest fold away. */
export const CARD_PREVIEW_ROWS = 5;

// Pill, card border and the corner ribbon per severity, through the tones.
const TONES: Record<RmaSeverity, { pill: string; border: string; ribbon: string }> = {
  overdue: { pill: "border-tone-red-border bg-tone-red-bg text-tone-red-fg", border: "border-tone-red-border", ribbon: "bg-tone-red-fg" },
  warning: { pill: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg", border: "border-tone-amber-border", ribbon: "bg-tone-amber-fg" },
  ok: { pill: "border-border bg-muted text-muted-foreground", border: "border-border", ribbon: "" },
};

function CountPill({ n, tone, label }: { n: number; tone: RmaSeverity; label: string }) {
  if (n === 0) return null;
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone].pill)}>
      {n} {label}
    </span>
  );
}

/** One case: code and who it belongs to on the left, how long it has sat on the right. */
function QueueRow({ row }: { row: RmaQueueRow }) {
  return (
    <li className="border-t border-border">
      <Link
        href={`/rma/cases/${row.id}`}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2.5 text-inherit outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm font-semibold">{row.rma_code}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <span className="truncate">
              {row.ticket.customer_name || row.ticket.device_name || `#${row.ticket.ticket_code}`}
            </span>
            {/* What the technician who held the unit thought. Advice, not a
                verdict — nothing here changes what the desk may do next. */}
            {row.recommended_eligible === false && (
              <span
                title="Rekomendasi teknisi: tidak layak"
                className="shrink-0 rounded-full border border-tone-amber-border bg-tone-amber-bg px-1.5 text-[0.6875rem] font-semibold text-tone-amber-fg"
              >
                tek: tidak layak
              </span>
            )}
          </span>
        </span>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold",
            TONES[row.severity].pill,
          )}
        >
          {row.severity !== "ok" && <AlertTriangle aria-hidden="true" className="size-3" />}
          {row.daysInStage} hari
        </span>
      </Link>
    </li>
  );
}

/**
 * One stage of the RMA queue, as a card.
 *
 * Shows the few cases that have waited longest and folds the rest into a
 * `<details>`. A stage holding forty cases is a number to react to, not a list
 * to read — but nothing is hidden behind a route that does not exist yet, so
 * every case on the card stays one click from the desk.
 */
export default function AttentionCard({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: RmaQueueRow[];
}) {
  const overdue = rows.filter((r) => r.severity === "overdue").length;
  const warning = rows.filter((r) => r.severity === "warning").length;
  const flagged: RmaSeverity = overdue > 0 ? "overdue" : warning > 0 ? "warning" : "ok";
  const accent = TONES[flagged];

  // Worst first: what the desk is furthest behind on.
  const sorted = [...rows].sort((a, b) => b.daysInStage - a.daysInStage);
  const preview = sorted.slice(0, CARD_PREVIEW_ROWS);
  const rest = sorted.slice(CARD_PREVIEW_ROWS);

  return (
    <section
      data-slot="rma-attention-card"
      className={cn("relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-5", accent.border)}
    >
      {flagged !== "ok" && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0 left-4 flex h-8 w-7 items-start justify-center pt-1.5 text-white [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)] md:left-5",
            accent.ribbon,
          )}
        >
          <AlertTriangle className="size-3.5" />
        </span>
      )}

      <div className={cn("flex flex-wrap items-start justify-between gap-3", flagged !== "ok" && "pl-9")}>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{hint}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CountPill n={overdue} tone="overdue" label="mendesak" />
          <CountPill n={warning} tone="warning" label="peringatan" />
          {overdue === 0 && warning === 0 && <CountPill n={rows.length} tone="ok" label="case" />}
        </div>
      </div>

      <ul>
        {preview.map((row) => (
          <QueueRow key={row.id} row={row} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-border text-sm font-semibold text-primary md:min-h-9 [&::-webkit-details-marker]:hidden">
            Lihat {rest.length} case lainnya
          </summary>
          <ul>
            {rest.map((row) => (
              <QueueRow key={row.id} row={row} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
