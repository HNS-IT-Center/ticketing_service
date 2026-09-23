import {
  ShieldCheck,
  PauseCircle,
  Send,
  Factory,
  Gavel,
  PackageCheck,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

/**
 * Read-only view of a ticket's RMA case for staff portals.
 *
 * Uses the same `.card` / `.badge` vocabulary and field markup as the ticket
 * detail pages, so it sits inside them without looking bolted on.
 *
 * Internal fields (vendor RMA number, hold reason, decision notes, stock
 * origin, event notes) are shown here deliberately — every caller is a staff
 * page. The public tracking page must NOT use this component.
 */

type RmaEventView = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: Date;
  actor: { id: string; name: string } | null;
};

export type RmaCaseView = {
  rma_code: string;
  status: string;
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

export const RMA_STATUS_META: Record<
  string,
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
  cancelled: { label: "Dibatalkan", tone: "red", Icon: XCircle },
};

export const RMA_DECISION_LABELS: Record<string, string> = {
  repaired: "Diperbaiki",
  replaced: "Diganti unit baru",
  refund: "Dana dikembalikan",
  rejected: "Ditolak vendor",
};

export function rmaStatusMeta(status: string) {
  const meta = RMA_STATUS_META[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "slate" as const,
    Icon: Clock,
  };
  return { ...meta, colors: TONES[meta.tone] };
}

export function RmaStatusBadge({ status }: { status: string }) {
  const { label, colors, Icon } = rmaStatusMeta(status);
  return (
    <span
      className="badge"
      style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

/** Label + value pair, matching the ticket detail pages. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="font-medium" style={{ wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

export default function RmaStatusCard({ rmaCase }: { rmaCase: RmaCaseView }) {
  // "Days at vendor" is not computed here: reading the clock during render is
  // impure. The RMA dashboard derives it once per request instead.
  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Status RMA</h3>
        <RmaStatusBadge status={rmaCase.status} />
      </div>

      <p
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
          marginBottom: "1rem",
        }}
      >
        {rmaCase.rma_code}
      </p>

      {rmaCase.status === "on_hold" && rmaCase.hold_reason && (
        <p
          style={{
            background: TONES.orange.bg,
            border: `1px solid ${TONES.orange.border}`,
            color: TONES.orange.fg,
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          <strong>Alasan ditahan:</strong> {rmaCase.hold_reason}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
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
      </div>

      {rmaCase.decision_notes && (
        <div style={{ marginTop: "1rem" }}>
          <Field label="Catatan Keputusan" value={rmaCase.decision_notes} />
        </div>
      )}

      <details style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem", fontWeight: 600 }}>
          Detail pemeriksaan teknisi
        </summary>
        <div className="flex flex-col gap-4" style={{ marginTop: "0.875rem" }}>
          <Field label="Kondisi Fisik" value={rmaCase.physical_condition} />
          <Field label="Deskripsi Kerusakan" value={rmaCase.fault_description} />
          <Field label="Hasil Tes" value={rmaCase.test_result} />
        </div>
      </details>

      {rmaCase.events.length > 0 && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
          <h4 style={{ margin: "0 0 0.875rem", fontSize: "0.9375rem" }}>Riwayat RMA</h4>
          <ol style={{ display: "flex", flexDirection: "column", gap: "0.875rem", listStyle: "none", padding: 0, margin: 0 }}>
            {rmaCase.events.map((event, i) => {
              const { label, colors, Icon } = rmaStatusMeta(event.to_status);
              return (
                <li key={event.id} style={{ display: "flex", gap: "0.75rem" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span
                      style={{
                        width: "1.5rem",
                        height: "1.5rem",
                        borderRadius: "50%",
                        background: colors.bg,
                        color: colors.fg,
                        border: `1px solid ${colors.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={12} />
                    </span>
                    {i < rmaCase.events.length - 1 && (
                      <span style={{ width: "1px", flex: 1, background: "var(--border)", marginTop: "0.25rem" }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, paddingBottom: "0.25rem" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {formatDateTime(event.created_at)}
                      {event.actor ? ` • ${event.actor.name}` : ""}
                    </div>
                    {event.note && (
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem", wordBreak: "break-word" }}>
                        {event.note}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
