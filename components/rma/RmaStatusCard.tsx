import {
  ShieldCheck,
  PauseCircle,
  Send,
  Factory,
  Gavel,
  PackageCheck,
  CheckCircle2,
  XCircle,
  ShieldX,
  Clock,
  ChevronDown,
} from "lucide-react";
import type { RmaStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rmaStatusDisplay, TONE_CLASSES } from "@/lib/status-display";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Read-only view of a ticket's RMA case for staff portals.
 *
 * A self-contained Card (it brings its own data-slot), so it sits inside the
 * legacy ticket detail pages as well as the migrated ones.
 *
 * Internal fields (vendor RMA number, hold reason, decision notes, stock
 * origin, event notes) are shown here deliberately — every caller is a staff
 * page. The public tracking page must NOT use this component.
 */

type RmaEventView = {
  id: string;
  from_status: RmaStatus | null;
  to_status: RmaStatus;
  note: string | null;
  created_at: Date;
  actor: { id: string; name: string } | null;
};

export type RmaCaseView = {
  rma_code: string;
  status: RmaStatus;
  unit_ownership: string;
  stock_origin: string | null;
  sn_verified: boolean;
  physical_condition: string;
  fault_description: string;
  test_result: string;
  hold_reason: string | null;
  vendor_name: string | null;
  vendor_rma_number: string | null;
  shipping_tracking: string | null;
  submitted_at: Date | null;
  decision: string | null;
  decision_notes: string | null;
  replacement_sn: string | null;
  decided_at: Date | null;
  unit_received_at: Date | null;
  closed_at: Date | null;
  handed_over_at: Date;
  handed_over_by: { id: string; name: string } | null;
  handler: { id: string; name: string } | null;
  events: RmaEventView[];
};

type Tone = { bg: string; fg: string; border: string };

const TONES: Record<string, Tone> = {
  amber: { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
  orange: { bg: "#ffedd5", fg: "#9a3412", border: "#fed7aa" },
  blue: { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  violet: { bg: "#ede9fe", fg: "#5b21b6", border: "#ddd6fe" },
  teal: { bg: "#ccfbf1", fg: "#115e59", border: "#99f6e4" },
  green: { bg: "#d1fae5", fg: "#065f46", border: "#a7f3d0" },
  red: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  slate: { bg: "var(--cream)", fg: "var(--text-secondary)", border: "var(--border)" },
};

/**
 * Exhaustive over RmaStatus on purpose. It used to be keyed by `string` with a
 * fallback that de-underscored whatever it was given, which meant a status
 * added to the schema rendered as raw enum text to whoever was looking — the
 * same way `rma_process` once did on the public page. Now a new status fails
 * the build here instead.
 */
export const RMA_STATUS_META: Record<
  RmaStatus,
  { label: string; tone: keyof typeof TONES; Icon: typeof ShieldCheck }
> = {
  pending_verification: { label: "Menunggu Verifikasi", tone: "amber", Icon: Clock },
  on_hold: { label: "Ditahan", tone: "orange", Icon: PauseCircle },
  verified: { label: "Terverifikasi", tone: "blue", Icon: ShieldCheck },
  submitted_to_vendor: { label: "Diajukan ke Vendor", tone: "blue", Icon: Send },
  in_vendor_process: { label: "Diproses Vendor", tone: "violet", Icon: Factory },
  vendor_decided: { label: "Keputusan Vendor", tone: "blue", Icon: Gavel },
  unit_received: { label: "Unit Diterima", tone: "teal", Icon: PackageCheck },
  closed: { label: "Selesai", tone: "green", Icon: CheckCircle2 },
  ineligible: { label: "Tidak Layak Klaim", tone: "amber", Icon: ShieldX },
  cancelled: { label: "Dibatalkan", tone: "red", Icon: XCircle },
};

export const RMA_DECISION_LABELS: Record<string, string> = {
  repaired: "Diperbaiki",
  replaced: "Diganti unit baru",
  refund: "Dana dikembalikan",
  rejected: "Ditolak vendor",
};

export function rmaStatusMeta(status: RmaStatus) {
  const meta = RMA_STATUS_META[status];
  return { ...meta, colors: TONES[meta.tone] };
}

export function RmaStatusBadge({ status }: { status: RmaStatus }) {
  const { label, Icon } = rmaStatusMeta(status);
  // Same label and icon as before; the colour comes from the shared tones,
  // so this badge and StatusBadge agree on every page.
  return (
    <span
      data-slot="rma-status-badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[rmaStatusDisplay(status).tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

/** Label + value pair, matching the ticket detail pages. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

export default function RmaStatusCard({ rmaCase }: { rmaCase: RmaCaseView }) {
  // "Days at vendor" is not computed here: reading the clock during render is
  // impure. The RMA dashboard derives it once per request instead.
  return (
    <Card className="md:[--card-spacing:--spacing(6)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold">Status RMA</CardTitle>
          <RmaStatusBadge status={rmaCase.status} />
        </div>
        <p className="font-mono text-sm text-muted-foreground">{rmaCase.rma_code}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rmaCase.status === "on_hold" && rmaCase.hold_reason && (
          <p className={cn("rounded-lg border px-4 py-3 text-sm", TONE_CLASSES.orange)}>
            <strong>Alasan ditahan:</strong> {rmaCase.hold_reason}
          </p>
        )}

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-4">
          <Field
            label="Kepemilikan Unit"
            value={rmaCase.unit_ownership === "customer" ? "Milik Customer" : "Stok Toko"}
          />
          <Field label="Asal Stok" value={rmaCase.stock_origin} />
          <Field label="SN Terverifikasi" value={rmaCase.sn_verified ? "Ya" : "Belum"} />
          <Field label="Vendor" value={rmaCase.vendor_name} />
          <Field label="No. RMA Vendor" value={rmaCase.vendor_rma_number} />
          <Field label="Resi Pengiriman" value={rmaCase.shipping_tracking} />
          <Field
            label="Keputusan Vendor"
            value={
              rmaCase.decision
                ? RMA_DECISION_LABELS[rmaCase.decision] ?? rmaCase.decision
                : null
            }
          />
          <Field label="SN Pengganti" value={rmaCase.replacement_sn} />
          <Field
            label="Diserahkan Oleh"
            value={
              rmaCase.handed_over_by
                ? `${rmaCase.handed_over_by.name} — ${formatDateTime(rmaCase.handed_over_at)}`
                : formatDateTime(rmaCase.handed_over_at)
            }
          />
          <Field label="Ditangani Oleh" value={rmaCase.handler?.name} />
          <Field
            label="Diajukan ke Vendor"
            value={rmaCase.submitted_at ? formatDateTime(rmaCase.submitted_at) : null}
          />
          <Field
            label="Keputusan Dicatat"
            value={rmaCase.decided_at ? formatDateTime(rmaCase.decided_at) : null}
          />
          <Field
            label="Unit Diterima Kembali"
            value={rmaCase.unit_received_at ? formatDateTime(rmaCase.unit_received_at) : null}
          />
          <Field
            label="Case Ditutup"
            value={rmaCase.closed_at ? formatDateTime(rmaCase.closed_at) : null}
          />
        </dl>

        {rmaCase.decision_notes && (
          <dl>
            <Field label="Catatan Keputusan" value={rmaCase.decision_notes} />
          </dl>
        )}

        <details className="group border-t border-border pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold md:min-h-9 [&::-webkit-details-marker]:hidden">
            Detail pemeriksaan teknisi
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-2 flex flex-col gap-4">
            <Field label="Kondisi Fisik" value={rmaCase.physical_condition} />
            <Field label="Deskripsi Kerusakan" value={rmaCase.fault_description} />
            <Field label="Hasil Tes" value={rmaCase.test_result} />
          </dl>
        </details>

        {rmaCase.events.length > 0 && (
          <section className="flex flex-col gap-3.5 border-t border-border pt-4">
            <h4 className="text-[0.9375rem] font-semibold">Riwayat RMA</h4>
            <ol className="flex flex-col gap-3.5">
              {rmaCase.events.map((event, i) => {
                const { label, Icon } = rmaStatusMeta(event.to_status);
                return (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border",
                          TONE_CLASSES[rmaStatusDisplay(event.to_status).tone],
                        )}
                      >
                        <Icon aria-hidden="true" className="size-3" />
                      </span>
                      {i < rmaCase.events.length - 1 && (
                        <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                        {event.actor ? ` • ${event.actor.name}` : ""}
                      </div>
                      {event.note && (
                        <div className="mt-0.5 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
                          {event.note}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
