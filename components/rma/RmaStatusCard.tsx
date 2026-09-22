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

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  pending_verification: { label: "Menunggu Verifikasi", className: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  on_hold: { label: "Ditahan", className: "bg-orange-50 text-orange-700 border-orange-200", Icon: PauseCircle },
  verified: { label: "Terverifikasi", className: "bg-sky-50 text-sky-700 border-sky-200", Icon: ShieldCheck },
  submitted_to_vendor: { label: "Diajukan ke Vendor", className: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Send },
  in_vendor_process: { label: "Diproses Vendor", className: "bg-violet-50 text-violet-700 border-violet-200", Icon: Factory },
  vendor_decided: { label: "Keputusan Vendor", className: "bg-blue-50 text-blue-700 border-blue-200", Icon: Gavel },
  unit_received: { label: "Unit Diterima", className: "bg-teal-50 text-teal-700 border-teal-200", Icon: PackageCheck },
  closed: { label: "Selesai", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  cancelled: { label: "Dibatalkan", className: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
};

const DECISION_LABELS: Record<string, string> = {
  repaired: "Diperbaiki",
  replaced: "Diganti unit baru",
  refund: "Dana dikembalikan",
  rejected: "Ditolak vendor",
};

function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status.replace(/_/g, " "),
      className: "bg-slate-50 text-slate-700 border-slate-200",
      Icon: Clock,
    }
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{value}</dd>
    </div>
  );
}

export default function RmaStatusCard({ rmaCase }: { rmaCase: RmaCaseView }) {
  const { label, className, Icon } = statusMeta(rmaCase.status);
  // "Days at vendor" is deliberately not computed here: reading the clock during
  // render is impure. It belongs on the RMA dashboard, which can derive it once.

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-slate-900">Status RMA</h3>
          <span className="font-mono text-sm text-slate-600">{rmaCase.rma_code}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      </header>

      {rmaCase.hold_reason && rmaCase.status === "on_hold" && (
        <p className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong className="font-semibold">Alasan ditahan:</strong> {rmaCase.hold_reason}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row
          label="Kepemilikan Unit"
          value={rmaCase.unit_ownership === "customer" ? "Milik Customer" : "Stok Toko"}
        />
        <Row label="Asal Stok" value={rmaCase.stock_origin} />
        <Row label="SN Terverifikasi" value={rmaCase.sn_verified ? "Ya" : "Belum"} />
        <Row
          label="Diserahkan Oleh"
          value={
            rmaCase.handed_over_by
              ? `${rmaCase.handed_over_by.name} — ${formatDateTime(rmaCase.handed_over_at)}`
              : formatDateTime(rmaCase.handed_over_at)
          }
        />
        <Row label="Ditangani Oleh" value={rmaCase.handler?.name} />
        <Row label="Vendor" value={rmaCase.vendor_name} />
        <Row label="No. RMA Vendor" value={rmaCase.vendor_rma_number} />
        <Row label="Resi Pengiriman" value={rmaCase.shipping_tracking} />
        <Row
          label="Diajukan ke Vendor"
          value={rmaCase.submitted_at ? formatDateTime(rmaCase.submitted_at) : null}
        />
        <Row
          label="Keputusan Vendor"
          value={
            rmaCase.decision
              ? `${DECISION_LABELS[rmaCase.decision] ?? rmaCase.decision}${
                  rmaCase.decided_at ? ` — ${formatDateTime(rmaCase.decided_at)}` : ""
                }`
              : null
          }
        />
        <Row label="SN Pengganti" value={rmaCase.replacement_sn} />
        <Row label="Catatan Keputusan" value={rmaCase.decision_notes} />
        <Row
          label="Unit Diterima Kembali"
          value={rmaCase.unit_received_at ? formatDateTime(rmaCase.unit_received_at) : null}
        />
        <Row label="Case Ditutup" value={rmaCase.closed_at ? formatDateTime(rmaCase.closed_at) : null} />
      </dl>

      <details className="mt-5 border-t border-slate-100 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Detail pemeriksaan teknisi
        </summary>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Kondisi Fisik" value={rmaCase.physical_condition} />
          <Row label="Deskripsi Kerusakan" value={rmaCase.fault_description} />
          <Row label="Hasil Tes" value={rmaCase.test_result} />
        </dl>
      </details>

      {rmaCase.events.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Riwayat RMA</h4>
          <ol className="flex flex-col gap-3">
            {rmaCase.events.map((event, i) => {
              const meta = statusMeta(event.to_status);
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${meta.className}`}
                    >
                      <meta.Icon className="h-3 w-3" />
                    </span>
                    {i < rmaCase.events.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 pb-1">
                    <span className="text-sm font-semibold text-slate-800">{meta.label}</span>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(event.created_at)}
                      {event.actor ? ` • ${event.actor.name}` : ""}
                    </span>
                    {event.note && (
                      <span className="text-xs text-slate-600 break-words">{event.note}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
