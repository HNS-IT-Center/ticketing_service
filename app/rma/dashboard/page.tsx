import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getRmaQueue } from "@/lib/rma/queue";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle, Clock, Inbox } from "lucide-react";

export const metadata = { title: "Antrean RMA — HNS IT Center" };

/** Queue order: what needs a decision first, then the vendor round-trip, then history. */
const QUEUE_SECTIONS = [
  {
    key: "pending_verification",
    title: "Menunggu Verifikasi",
    hint: "Unit baru diserahkan teknisi. Periksa dokumen, SN, dan fisik.",
    urgent: true,
  },
  {
    key: "on_hold",
    title: "Ditahan",
    hint: "Menunggu kelengkapan. Selesaikan atau batalkan.",
    urgent: true,
  },
  { key: "verified", title: "Siap Diajukan ke Vendor", hint: "Lengkapi nama vendor dan nomor RMA." },
  { key: "submitted_to_vendor", title: "Diajukan ke Vendor", hint: "Menunggu konfirmasi vendor." },
  { key: "in_vendor_process", title: "Diproses Vendor", hint: "Menunggu keputusan vendor." },
  { key: "vendor_decided", title: "Keputusan Keluar", hint: "Tunggu unit kembali ke toko." },
  { key: "unit_received", title: "Unit Diterima", hint: "Tutup case agar tiket lanjut ke serah terima." },
] as const;

const DECISION_LABELS: Record<string, string> = {
  repaired: "Diperbaiki",
  replaced: "Diganti",
  refund: "Refund",
  rejected: "Ditolak vendor",
};

export default async function RmaDashboardPage() {
  await requireRole("RMA", "Administrator");

  // Loaded in lib/rma/queue.ts so the clock read that derives "days at vendor"
  // happens outside any component render.
  const { rows, closedCount, cancelledCount } = await getRmaQueue();

  const bySection = new Map<string, typeof rows>();
  for (const section of QUEUE_SECTIONS) {
    bySection.set(
      section.key,
      rows.filter((r) => r.status === section.key)
    );
  }

  const urgentCount = QUEUE_SECTIONS.filter((s) => "urgent" in s && s.urgent).reduce(
    (total, s) => total + (bySection.get(s.key)?.length ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">Antrean RMA</h1>
        <p className="page-description">
          {rows.length} case aktif
          {urgentCount > 0 ? ` • ${urgentCount} butuh tindakan sekarang` : ""} • {closedCount} selesai
          {cancelledCount > 0 ? ` • ${cancelledCount} dibatalkan` : ""}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
          <Inbox className="h-10 w-10 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">Tidak ada case RMA aktif.</p>
          <p className="text-xs text-slate-500">
            Case muncul di sini setelah teknisi menyerahkan unit klaim ke RMA.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {QUEUE_SECTIONS.map((section) => {
            const sectionRows = bySection.get(section.key) ?? [];
            if (sectionRows.length === 0) return null;
            const urgent = "urgent" in section && section.urgent;

            return (
              <section
                key={section.key}
                className={`rounded-xl border p-5 ${
                  urgent ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                      {urgent && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {section.title}
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {sectionRows.length}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">{section.hint}</p>
                  </div>
                </div>

                <ul className="flex flex-col gap-3">
                  {sectionRows.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/rma/cases/${row.id}`}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {row.rma_code}
                          </span>
                          <span className="text-xs text-slate-500">
                            #{row.ticket.ticket_code}
                            {row.ticket.store_location
                              ? ` • ${row.ticket.store_location.code}`
                              : ""}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                          {row.ticket.customer_name && <span>{row.ticket.customer_name}</span>}
                          {row.ticket.device_name && <span>{row.ticket.device_name}</span>}
                          {row.ticket.device_sn && (
                            <span className="font-mono">SN {row.ticket.device_sn}</span>
                          )}
                          {row.vendor_name && <span>Vendor: {row.vendor_name}</span>}
                          {row.decision && (
                            <span className="font-medium text-slate-700">
                              {DECISION_LABELS[row.decision] ?? row.decision}
                            </span>
                          )}
                          {row.handler && <span>PIC: {row.handler.name}</span>}
                        </div>

                        {row.status === "on_hold" && row.hold_reason && (
                          <p className="rounded border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-800">
                            {row.hold_reason}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Masuk {formatDateTime(row.created_at)} ({row.daysOpen} hari)
                          </span>
                          {row.daysAtVendor !== null && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                row.daysAtVendor >= 14
                                  ? "bg-rose-100 text-rose-700"
                                  : row.daysAtVendor >= 7
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {row.daysAtVendor} hari di vendor
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
