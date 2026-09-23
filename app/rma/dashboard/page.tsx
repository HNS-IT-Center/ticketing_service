import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getRmaQueue, VENDOR_OVERDUE_DAYS, VENDOR_WARNING_DAYS } from "@/lib/rma/queue";
import { formatDateTime } from "@/lib/utils";
import { RmaStatusBadge, RMA_DECISION_LABELS, rmaStatusMeta } from "@/components/rma/RmaStatusCard";
import { AlertTriangle, Clock, Inbox, Factory, CheckCircle2, ListChecks, History } from "lucide-react";

export const metadata = { title: "Dashboard RMA — HNS IT Center" };

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

function StatCard({
  icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint?: string;
  tone?: { bg: string; fg: string };
}) {
  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: "2.5rem",
            height: "2.5rem",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: tone?.bg ?? "var(--cream)",
            color: tone?.fg ?? "var(--primary)",
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            {label}
          </div>
        </div>
      </div>
      {hint && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.65rem 0 0" }}>{hint}</p>
      )}
    </div>
  );
}

export default async function RmaDashboardPage() {
  await requireRole("RMA", "Administrator");

  // Loaded in lib/rma/queue.ts so every clock-derived number comes from a
  // single instant, outside any component render.
  const { rows, activity, stats } = await getRmaQueue();

  const bySection = new Map<string, typeof rows>();
  for (const section of QUEUE_SECTIONS) {
    bySection.set(section.key, rows.filter((r) => r.status === section.key));
  }

  const decisionEntries = Object.entries(stats.decisions).filter(([, n]) => n > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem" }}>Dashboard RMA</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Pantau case klaim yang sedang berjalan dan aktivitas terakhirnya.
        </p>
      </div>

      {/* ── Ringkasan ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem" }}>
        <StatCard
          icon={<ListChecks size={20} />}
          value={stats.active}
          label="Case Aktif"
          hint={stats.oldestOpenDays > 0 ? `Terlama ${stats.oldestOpenDays} hari` : undefined}
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          value={stats.needsAction}
          label="Butuh Tindakan"
          hint="Menunggu verifikasi atau ditahan"
          tone={stats.needsAction > 0 ? { bg: "#fef3c7", fg: "#92400e" } : undefined}
        />
        <StatCard
          icon={<Factory size={20} />}
          value={stats.atVendor}
          label="Di Vendor"
          hint="Diajukan atau sedang diproses"
        />
        <StatCard
          icon={<Clock size={20} />}
          value={stats.overdue}
          label={`Lewat ${VENDOR_OVERDUE_DAYS} Hari`}
          hint="Di vendor terlalu lama, perlu dikejar"
          tone={stats.overdue > 0 ? { bg: "#fee2e2", fg: "#991b1b" } : undefined}
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          value={stats.closedThisMonth}
          label="Selesai Bulan Ini"
          hint={`Total ${stats.closedCount} selesai${stats.cancelledCount > 0 ? ` • ${stats.cancelledCount} dibatalkan` : ""}`}
          tone={{ bg: "#d1fae5", fg: "#065f46" }}
        />
      </div>

      {decisionEntries.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.75rem" }}>Keputusan Vendor</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {decisionEntries.map(([decision, count]) => (
              <span
                key={decision}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--cream)",
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.8125rem",
                }}
              >
                {RMA_DECISION_LABELS[decision] ?? decision}
                <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline aktivitas lintas case ──────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <History size={16} style={{ color: "var(--text-muted)" }} />
          <h3 style={{ margin: 0 }}>Aktivitas Terbaru</h3>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
          Perpindahan status terakhir dari semua case RMA.
        </p>

        {activity.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
            Belum ada aktivitas.
          </p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: "0.875rem", listStyle: "none", padding: 0, margin: 0 }}>
            {activity.map((event, i) => {
              const { label, colors, Icon } = rmaStatusMeta(event.to_status);
              const fromLabel = event.from_status ? rmaStatusMeta(event.from_status).label : null;
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
                    {i < activity.length - 1 && (
                      <span style={{ width: "1px", flex: 1, background: "var(--border)", marginTop: "0.25rem" }} />
                    )}
                  </div>

                  <div style={{ minWidth: 0, paddingBottom: "0.25rem", flex: 1 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.35rem" }}>
                      <Link
                        href={`/rma/cases/${event.rma_case.id}`}
                        style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", fontWeight: 600 }}
                      >
                        {event.rma_case.rma_code}
                      </Link>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        #{event.rma_case.ticket.ticket_code}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, marginTop: "0.1rem" }}>
                      {fromLabel ? `${fromLabel} → ${label}` : label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {formatDateTime(event.created_at)}
                      {event.daysAgo > 0 ? ` • ${event.daysAgo} hari lalu` : " • hari ini"}
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
        )}
      </div>

      {/* ── Antrean ─────────────────────────────────────────────────────── */}
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
                          borderRadius: "6px",
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
                            background:
                              row.daysAtVendor >= VENDOR_OVERDUE_DAYS
                                ? "#fee2e2"
                                : row.daysAtVendor >= VENDOR_WARNING_DAYS
                                  ? "#fef3c7"
                                  : "var(--cream)",
                            color:
                              row.daysAtVendor >= VENDOR_OVERDUE_DAYS
                                ? "#991b1b"
                                : row.daysAtVendor >= VENDOR_WARNING_DAYS
                                  ? "#92400e"
                                  : "var(--text-secondary)",
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
