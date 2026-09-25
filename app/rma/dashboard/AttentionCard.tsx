import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { RmaQueueRow, RmaSeverity } from "@/lib/rma/queue";

/** How many rows a card shows before the rest fold away. */
export const CARD_PREVIEW_ROWS = 5;

const TONES: Record<RmaSeverity, { bg: string; fg: string; border: string }> = {
  overdue: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
  warning: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" },
  ok: { bg: "var(--cream)", fg: "var(--text-secondary)", border: "var(--border)" },
};

function CountPill({ n, tone, label }: { n: number; tone: RmaSeverity; label: string }) {
  if (n === 0) return null;
  const c = TONES[tone];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: "999px",
        padding: "0.15rem 0.6rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {n} {label}
    </span>
  );
}

/** One case: code and who it belongs to on the left, how long it has sat on the right. */
function QueueRow({ row }: { row: RmaQueueRow }) {
  const tone = TONES[row.severity];
  return (
    <li style={{ borderTop: "1px solid var(--border)" }}>
      <Link
        href={`/rma/cases/${row.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.6rem 0",
          color: "inherit",
          textDecoration: "none",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.875rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.rma_code}
          </span>
          <span
            style={{
              display: "block",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.ticket.customer_name || row.ticket.device_name || `#${row.ticket.ticket_code}`}
          </span>
        </span>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            flexShrink: 0,
            background: tone.bg,
            color: tone.fg,
            border: `1px solid ${tone.border}`,
            borderRadius: "999px",
            padding: "0.2rem 0.6rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {row.severity !== "ok" && <AlertTriangle size={12} />}
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
    <div
      className="card"
      style={{
        position: "relative",
        padding: "1.25rem",
        borderColor: flagged === "ok" ? undefined : accent.border,
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {flagged !== "ok" && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: "1.25rem",
            width: "1.75rem",
            height: "2rem",
            background: accent.fg,
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "0.3rem",
            color: "#fff",
          }}
        >
          <AlertTriangle size={13} />
        </span>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          flexWrap: "wrap",
          paddingLeft: flagged !== "ok" ? "2.25rem" : 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{title}</h3>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {hint}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <CountPill n={overdue} tone="overdue" label="mendesak" />
          <CountPill n={warning} tone="warning" label="peringatan" />
          {overdue === 0 && warning === 0 && <CountPill n={rows.length} tone="ok" label="case" />}
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {preview.map((row) => (
          <QueueRow key={row.id} row={row} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              borderTop: "1px solid var(--border)",
              paddingTop: "0.75rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--primary)",
              listStyle: "none",
            }}
          >
            Lihat {rest.length} case lainnya
          </summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rest.map((row) => (
              <QueueRow key={row.id} row={row} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
