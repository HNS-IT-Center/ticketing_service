import Link from "next/link";
import { AlertTriangle, Timer } from "lucide-react";
import { LONG_LEAD_DAYS, type RmaQueueRow, type RmaSeverity } from "@/lib/rma/queue";
import { holdReasonMeta } from "@/lib/rma/hold-reason";
import { RMA_DECISION_LABELS } from "@/lib/rma/decision";

/** A stage's targets, printed on its card: they decide every colour on this page. */
export type StageSla = { warning: number; overdue: number };
export function SlaLine({ sla }: { sla: StageSla }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.75rem] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-tone-amber-fg" /> kuning ≥ {sla.warning} hari
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-tone-red-fg" /> merah ≥ {sla.overdue} hari
      </span>
    </p>
  );
}
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

/** The vendor's name as listed, else as typed when the claim went out. */
export function caseVendorName(row: Pick<RmaQueueRow, "vendor" | "vendor_name">): string | null {
  return row.vendor?.name ?? (row.vendor_name?.trim() || null);
}

/**
 * The one line of explanation a case needs on the dashboard — the words
 * themselves, no labels (owner, 2026-11-12): why it is held, or what the
 * vendor said. Internal fields; this page is staff only.
 */
export function caseNote(row: RmaQueueRow): string | null {
  if (row.status === "on_hold") {
    return row.hold_reason?.trim() || (row.hold_reason_code ? holdReasonMeta(row.hold_reason_code).label : null);
  }
  if (row.status === "vendor_decided" || row.status === "unit_received") {
    return row.decision_notes?.trim() || (row.decision ? RMA_DECISION_LABELS[row.decision] : null);
  }
  return null;
}

/**
 * One row, as clean as it can be (owner, 2026-11-12): number, unit and
 * keterangan on the left; vendor and days on the right. Who raised the claim
 * is on the case page, not here.
 */
export function CaseLine({
  href,
  code,
  unit,
  note,
  vendor,
  children,
}: {
  href?: string;
  code: string;
  unit: string;
  note?: string | null;
  vendor?: string | null;
  /** The day pills. */
  children: React.ReactNode;
}) {
  return (
    <li className="border-t border-border">
      <RowLink href={href}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm font-semibold">{code}</span>
          <span className="block truncate text-[0.8125rem] text-muted-foreground">{unit}</span>
          {note && <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-foreground">{note}</span>}
        </span>
        <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-1 sm:max-w-[50%] sm:flex-row sm:items-center sm:gap-2">
          {vendor && <span className="max-w-full truncate text-right text-[0.8125rem] font-semibold text-foreground">{vendor}</span>}
          <span className="flex flex-col items-end gap-1">{children}</span>
        </span>
      </RowLink>
    </li>
  );
}

/** Days in the current stage, coloured by its target. */
function StagePill({ row }: { row: RmaQueueRow }) {
  return (
    <span
      title="Lama di tahap ini"
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap", TONES[row.severity].pill)}
    >
      {row.severity !== "ok" && <AlertTriangle aria-hidden="true" className="size-3" />}
      {row.daysInStage} hari
    </span>
  );
}

/** Days since the claim came in. Red once it passes LONG_LEAD_DAYS. */
function LeadPill({ days }: { days: number }) {
  const long = days >= LONG_LEAD_DAYS;
  return (
    <span
      title="Total sejak klaim masuk"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
        long ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg" : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Timer aria-hidden="true" className="size-3" /> total {days} hari
    </span>
  );
}

const unitOf = (row: RmaQueueRow) => row.ticket.device_name?.trim() || `#${row.ticket.ticket_code}`;

function QueueRow({ row }: { row: RmaQueueRow }) {
  return (
    <CaseLine href={`/rma/cases/${row.id}`} code={row.rma_code} unit={unitOf(row)} note={caseNote(row)} vendor={caseVendorName(row)}>
      <StagePill row={row} />
      <LeadPill days={row.leadDays} />
    </CaseLine>
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
  sla,
}: {
  title: string;
  hint: string;
  rows: RmaQueueRow[];
  sla: StageSla;
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
      className={cn("relative mb-4 flex break-inside-avoid flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-5", accent.border)}
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
          <SlaLine sla={sla} />
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

function RowLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const cls = "-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2.5 text-inherit";
  return href ? (
    <Link href={href} className={cn(cls, "outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** A claim still with the technician: no case yet, so no RMA stage measures it. */
export type PreHandoverRow = {
  id: string;
  ticket_code: string;
  status: string;
  customer_name: string | null;
  device_name: string | null;
  daysWaiting: number;
  severity: RmaSeverity;
  store_location: { code: string } | null;
  technician: { name: string } | null;
};

/**
 * The technician's side of the queue: claims raised but not handed over. Read
 * only here — the desk can see them coming and chase them, not act on them.
 */
export function PreHandoverCard({
  rows,
  sla,
  linkTickets,
}: {
  rows: PreHandoverRow[];
  sla: StageSla;
  /** Whether the viewer may open Semua Tiket; otherwise the rows are not links. */
  linkTickets: boolean;
}) {
  const overdue = rows.filter((r) => r.severity === "overdue").length;
  const warning = rows.filter((r) => r.severity === "warning").length;
  const accent = TONES[overdue > 0 ? "overdue" : warning > 0 ? "warning" : "ok"];
  const sorted = [...rows].sort((a, b) => b.daysWaiting - a.daysWaiting);
  const row = (t: PreHandoverRow) => (
    <CaseLine
      key={t.id}
      href={linkTickets ? `/admin/tickets/${t.id}` : undefined}
      code={`${t.ticket_code}${t.store_location ? ` · ${t.store_location.code}` : ""}`}
      unit={t.device_name?.trim() || "—"}
      note={t.status === "on_progress" ? "Sedang diperiksa teknisi" : "Belum diambil teknisi"}
      vendor={t.technician?.name ?? null}
    >
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap", TONES[t.severity].pill)}>
        {t.severity !== "ok" && <AlertTriangle aria-hidden="true" className="size-3" />}
        {t.daysWaiting} hari
      </span>
    </CaseLine>
  );
  return (
    <section data-slot="rma-attention-card" className={cn("mb-4 flex break-inside-avoid flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-5", accent.border)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">Belum Diserahkan ke RMA</h3>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            Klaim sudah masuk, unit masih diperiksa teknisi. Case RMA terbentuk setelah diserahkan. Dihitung dari tiket dibuat.
          </p>
          <SlaLine sla={sla} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CountPill n={overdue} tone="overdue" label="mendesak" />
          <CountPill n={warning} tone="warning" label="peringatan" />
          {overdue === 0 && warning === 0 && <CountPill n={rows.length} tone="ok" label="tiket" />}
        </div>
      </div>
      <ul>{sorted.slice(0, CARD_PREVIEW_ROWS).map(row)}</ul>
      {sorted.length > CARD_PREVIEW_ROWS && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-border text-sm font-semibold text-primary md:min-h-9 [&::-webkit-details-marker]:hidden">
            Lihat {sorted.length - CARD_PREVIEW_ROWS} tiket lainnya
          </summary>
          <ul>{sorted.slice(CARD_PREVIEW_ROWS).map(row)}</ul>
        </details>
      )}
    </section>
  );
}

/** One claim in "Lead Time Lewat 2 Minggu": a case, or a claim not handed over yet. */
export type LongLeadEntry = {
  key: string;
  code: string;
  unit: string;
  /** The case's keterangan, else where it stands. */
  note: string | null;
  /** The vendor, or for a claim not handed over the technician holding it. */
  vendor: string | null;
  leadDays: number;
  href?: string;
};

/**
 * Every claim open LONG_LEAD_DAYS or more since it came in, longest first
 * (owner, 2026-11-12), whatever lane it sits in — the stage cards measure the
 * time in a stage, which reads as fresh right after a case moves even when the
 * customer has waited a month.
 */
export function LongLeadCard({ entries }: { entries: LongLeadEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.leadDays - a.leadDays);
  const item = (e: LongLeadEntry) => (
    <CaseLine key={e.key} href={e.href} code={e.code} unit={e.unit} note={e.note} vendor={e.vendor}>
      <span title="Sejak klaim masuk" className="inline-flex items-center gap-1 rounded-full border border-tone-red-border bg-tone-red-bg px-2.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap text-tone-red-fg">
        <Timer aria-hidden="true" className="size-3" /> {e.leadDays} hari
      </span>
    </CaseLine>
  );
  return (
    <section data-slot="rma-attention-card" className="flex flex-col gap-3 rounded-xl border border-tone-red-border bg-card p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-foreground">
            <Timer aria-hidden="true" className="size-[18px] text-destructive" /> Lead Time Lewat 2 Minggu
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            Klaim yang sudah {LONG_LEAD_DAYS} hari atau lebih sejak tiketnya dibuat dan belum selesai, terlama di atas.
          </p>
        </div>
        <CountPill n={sorted.length} tone="overdue" label="klaim" />
      </div>
      <ul className="lg:columns-2 lg:gap-6 [&>li]:break-inside-avoid">{sorted.slice(0, CARD_PREVIEW_ROWS * 2).map(item)}</ul>
      {sorted.length > CARD_PREVIEW_ROWS * 2 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-border text-sm font-semibold text-primary md:min-h-9 [&::-webkit-details-marker]:hidden">
            Lihat {sorted.length - CARD_PREVIEW_ROWS * 2} klaim lainnya
          </summary>
          <ul className="lg:columns-2 lg:gap-6 [&>li]:break-inside-avoid">{sorted.slice(CARD_PREVIEW_ROWS * 2).map(item)}</ul>
        </details>
      )}
    </section>
  );
}
