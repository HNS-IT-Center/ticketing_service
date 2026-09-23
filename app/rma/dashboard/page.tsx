import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getRmaQueue } from "@/lib/rma/queue";
import { formatDateTime } from "@/lib/utils";
import { RmaStatusBadge, RMA_DECISION_LABELS } from "@/components/rma/RmaStatusCard";
import { AlertTriangle, Clock, Inbox } from "lucide-react";

export const metadata = { title: "Antrean RMA — HNS IT Center" };

/** Queue order: what needs a decision first, then the vendor round-trip. */
const QUEUE_SECTIONS = [
  {
    key: "pending_verification",
    title: "Menunggu Verifikasi",
    hint: "Unit baru diserahkan teknisi. Periksa dokumen, SN, dan fisik.",
    urgent: true,
  },
  { key: "on_hold", title: "Ditahan", hint: "Menunggu kelengkapan. Selesaikan atau batalkan.", urgent: true },
  { key: "verified", title: "Siap Diajukan ke Vendor", hint: "Lengkapi nama vendor dan nomor RMA." },
  { key: "submitted_to_vendor", title: "Diajukan ke Vendor", hint: "Menunggu konfirmasi vendor." },
  { key: "in_vendor_process", title: "Diproses Vendor", hint: "Menunggu keputusan vendor." },
  { key: "vendor_decided", title: "Keputusan Keluar", hint: "Tunggu unit kembali ke toko." },
  { key: "unit_received", title: "Unit Diterima", hint: "Tutup case agar tiket lanjut ke serah terima." },
] as const;

export default async function RmaDashboardPage() {
  await requireRole("RMA", "Administrator");

  // Loaded in lib/rma/queue.ts so the clock read that derives "days at vendor"
  // happens outside any component render.
  const { rows, closedCount, cancelledCount } = await getRmaQueue();

  const bySection = new Map<string, typeof rows>();
  for (const section of QUEUE_SECTIONS) {
    bySection.set(section.key, rows.filter((r) => r.status === section.key));
  }

  const urgentCount = QUEUE_SECTIONS.filter((s) => "urgent" in s && s.urgent).reduce(
    (total, s) => total + (bySection.get(s.key)?.length ?? 0),
    0
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem" }}>Antrean RMA</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {rows.length} case aktif
          {urgentCount > 0 ? ` • ${urgentCount} butuh tindakan sekarang` : ""} • {closedCount} selesai
          {cancelledCount > 0 ? ` • ${cancelledCount} dibatalkan` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <Inbox size={40} style={{ margin: "0 auto 0.75rem", color: "var(--text-muted)", opacity: 0.6 }} />
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Tidak ada case RMA aktif.</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
            Case muncul di sini setelah teknisi menyerahkan unit klaim ke RMA.
          </p>
        </div>
      ) : (
        QUEUE_SECTIONS.map((section) => {
          const sectionRows = bySection.get(section.key) ?? [];
          if (sectionRows.length === 0) return null;
          const urgent = "urgent" in section && section.urgent;

          return (
            <div
              key={section.key}
              className="card"
              style={urgent ? { borderColor: "#fde68a", background: "#fffbeb" } : undefined}
            >
              <div style={{ marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {urgent && <AlertTriangle size={16} style={{ color: "#b45309" }} />}
                  {section.title}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      background: "var(--cream-dark)",
                      borderRadius: "999px",
                      padding: "0.1rem 0.5rem",
                    }}
                  >
                    {sectionRows.length}
                  </span>
                </h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
                  {section.hint}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {sectionRows.map((row) => (
                  <Link key={row.id} href={`/rma/cases/${row.id}`} className="rma-queue-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.875rem", fontWeight: 600 }}>
                        {row.rma_code}
                      </span>
                      <RmaStatusBadge status={row.status} />
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      <span>
                        #{row.ticket.ticket_code}
                        {row.ticket.store_location ? ` • ${row.ticket.store_location.code}` : ""}
                      </span>
                      {row.ticket.customer_name && <span>{row.ticket.customer_name}</span>}
                      {row.ticket.device_name && <span>{row.ticket.device_name}</span>}
                      {row.ticket.device_sn && (
                        <span style={{ fontFamily: "ui-monospace, monospace" }}>SN {row.ticket.device_sn}</span>
                      )}
                      {row.vendor_name && <span>Vendor: {row.vendor_name}</span>}
                      {row.decision && (
                        <span style={{ fontWeight: 600 }}>
                          {RMA_DECISION_LABELS[row.decision] ?? row.decision}
                        </span>
                      )}
                      {row.handler && <span>PIC: {row.handler.name}</span>}
                    </div>

                    {row.status === "on_hold" && row.hold_reason && (
                      <p
                        style={{
                          background: "#ffedd5",
                          border: "1px solid #fed7aa",
                          color: "#9a3412",
                          borderRadius: "var(--radius-sm, 6px)",
                          padding: "0.35rem 0.6rem",
                          fontSize: "0.75rem",
                          margin: 0,
                        }}
                      >
                        {row.hold_reason}
                      </p>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <Clock size={12} />
                        Masuk {formatDateTime(row.created_at)} ({row.daysOpen} hari)
                      </span>
                      {row.daysAtVendor !== null && (
                        <span
                          style={{
                            fontWeight: 600,
                            borderRadius: "999px",
                            padding: "0.1rem 0.5rem",
                            background: row.daysAtVendor >= 14 ? "#fee2e2" : row.daysAtVendor >= 7 ? "#fef3c7" : "var(--cream)",
                            color: row.daysAtVendor >= 14 ? "#991b1b" : row.daysAtVendor >= 7 ? "#92400e" : "var(--text-secondary)",
                          }}
                        >
                          {row.daysAtVendor} hari di vendor
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
