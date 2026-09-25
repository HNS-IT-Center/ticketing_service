import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getRmaQueue, RMA_STAGE_SLA, VENDOR_OVERDUE_DAYS } from "@/lib/rma/queue";
import AttentionCard from "./AttentionCard";
import { RMA_DECISION_LABELS } from "@/components/rma/RmaStatusCard";
import { AlertTriangle, Clock, Factory, CheckCircle2, ListChecks, History, CheckCircle, UserX, Timer } from "lucide-react";

export const metadata = { title: "Dashboard RMA — HNS IT Center" };

/** Queue order: what needs a decision first, then the vendor round-trip. */
const QUEUE_SECTIONS = [
  {
    key: "pending_verification",
    title: "Baru Masuk",
    hint: "Unit baru diserahkan teknisi. Periksa dokumen, SN, dan fisik.",
  },
  { key: "on_hold", title: "Ditahan", hint: "Menunggu kelengkapan. Selesaikan atau batalkan." },
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

/** A labelled count with a proportion bar. Used for the claim breakdowns. */
function BreakdownCard({
  title,
  hint,
  rows,
  total,
}: {
  title: string;
  hint: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  // Scaled against the biggest row, not the total: with one dominant value the
  // rest would otherwise be invisible slivers.
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 0.25rem" }}>{title}</h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 0.85rem" }}>
        {hint}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {rows.map((row) => (
          <li key={row.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                fontSize: "0.875rem",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.label}
              </span>
              <span style={{ flexShrink: 0, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
                {row.count} ({Math.round((row.count / total) * 100)}%)
              </span>
            </div>
            <div style={{ height: "6px", borderRadius: "999px", background: "var(--cream-dark, #eee)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(row.count / max) * 100}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: "var(--primary)",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RmaDashboardPage() {
  await requireRole("RMA", "Administrator");

  // Loaded in lib/rma/queue.ts so every clock-derived number comes from a
  // single instant, outside any component render.
  const { rows, stats } = await getRmaQueue();

  const bySection = new Map<string, typeof rows>();
  for (const section of QUEUE_SECTIONS) {
    bySection.set(section.key, rows.filter((r) => r.status === section.key));
  }

  // A stage with nothing in it says something too, but as one green line rather
  // than an empty card taking up a grid cell.
  const activeSections = QUEUE_SECTIONS.filter(
    (s) => (bySection.get(s.key) ?? []).length > 0
  );
  const clearSections = QUEUE_SECTIONS.filter(
    (s) => (bySection.get(s.key) ?? []).length === 0
  );

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
          hint={
            stats.overdue > 0
              ? `${stats.overdue} lewat ${VENDOR_OVERDUE_DAYS} hari, perlu dikejar`
              : "Diajukan atau sedang diproses"
          }
        />
        {/* Counts the same thing as the "melewati tenggat" pill above. Before,
            this card counted only vendor days over 14 while the pill counted
            every stage past its own target, so the two disagreed on screen. */}
        <StatCard
          icon={<Clock size={20} />}
          value={stats.pastDue}
          label="Lewat Tenggat"
          hint="Melewati target tahapannya"
          tone={stats.pastDue > 0 ? { bg: "#fee2e2", fg: "#991b1b" } : undefined}
        />
        <StatCard
          icon={<UserX size={20} />}
          value={stats.unassigned}
          label="Tanpa PIC"
          hint={stats.unassigned > 0 ? "Belum ada yang memegang" : "Semua case ada pemiliknya"}
          tone={stats.unassigned > 0 ? { bg: "#fef3c7", fg: "#92400e" } : undefined}
        />
        <StatCard
          icon={<Timer size={20} />}
          value={stats.resolution.thisMonth ?? stats.resolution.overall ?? 0}
          label="Rata-rata Selesai (hari)"
          hint={
            stats.resolution.sample === 0
              ? "Belum ada case yang ditutup"
              : stats.resolution.thisMonth !== null && stats.resolution.previous !== null
                ? stats.resolution.thisMonth < stats.resolution.previous
                  ? `Lebih cepat dari ${stats.resolution.previous} hari sebelumnya`
                  : stats.resolution.thisMonth > stats.resolution.previous
                    ? `Lebih lambat dari ${stats.resolution.previous} hari sebelumnya`
                    : "Sama dengan bulan sebelumnya"
                : `Dari ${stats.resolution.sample} case tertutup`
          }
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          value={stats.closedThisMonth}
          label="Selesai Bulan Ini"
          hint={
            // The single number that says whether the desk is keeping up.
            `${stats.openedThisMonth} masuk bulan ini` +
            (stats.netThisMonth > 0
              ? ` • tumpukan +${stats.netThisMonth}`
              : stats.netThisMonth < 0
                ? ` • tumpukan ${stats.netThisMonth}`
                : " • seimbang")
          }
          tone={
            stats.netThisMonth > 0
              ? { bg: "#fef3c7", fg: "#92400e" }
              : { bg: "#d1fae5", fg: "#065f46" }
          }
        />
      </div>

      {/* ── Antrean per tahapan ─────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <CheckCircle2
            size={40}
            style={{ margin: "0 auto 0.75rem", color: "#059669", opacity: 0.8 }}
          />
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Tidak ada case RMA aktif.</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
            Case muncul di sini setelah teknisi menyerahkan unit klaim ke RMA.
          </p>
        </div>
      ) : (
        <>
          {/* Band ringkas: satu angka yang jadi alasan membuka halaman ini. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertTriangle size={18} style={{ color: stats.pastDue > 0 ? "#dc2626" : "#b45309" }} />
              <h2 style={{ margin: 0, fontSize: "1.0625rem" }}>Perlu Perhatian</h2>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {stats.active} case aktif
              </span>
            </div>
            {stats.pastDue > 0 && (
              <span
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: "999px",
                  padding: "0.2rem 0.7rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {stats.pastDue} melewati tenggat
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1rem",
              alignItems: "start",
            }}
          >
            {activeSections.map((section) => (
              <AttentionCard
                key={section.key}
                title={section.title}
                hint={section.hint}
                rows={bySection.get(section.key) ?? []}
              />
            ))}
          </div>

          {/* Tahapan yang kosong: ditampilkan supaya jelas "memang tidak ada",
              bukan "belum dimuat". */}
          {clearSections.length > 0 && (
            <div className="card" style={{ borderColor: "#a7f3d0", background: "#f0fdf4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle size={18} style={{ color: "#059669" }} />
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Tidak ada tunggakan</h3>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "#047857", margin: "0.25rem 0 1rem" }}>
                Tidak ada case yang menunggu di tahapan berikut.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {clearSections.map((section) => (
                  <li
                    key={section.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.45rem 0",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                      }}
                    >
                      <CheckCircle size={15} style={{ color: "#059669", flexShrink: 0 }} />
                      {section.title}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#047857",
                        fontFamily: "ui-monospace, monospace",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Tenggat {RMA_STAGE_SLA[section.key].overdue} hari
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ── Sebaran klaim ───────────────────────────────────────────────── */}
      {stats.totalClaims > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <BreakdownCard
            title="Klaim per Merek"
            hint={`Dari ${stats.totalClaims} klaim yang pernah masuk. Diambil dari kata pertama nama perangkat.`}
            rows={stats.brands.map((b) => ({ label: b.name, count: b.count }))}
            total={stats.totalClaims}
          />
          <BreakdownCard
            title="Klaim per Tipe Perangkat"
            hint="Kategori perangkat saat tiket dibuat."
            rows={stats.deviceTypes.map((d) => ({ label: d.label, count: d.count }))}
            total={stats.totalClaims}
          />
        </div>
      )}

      {/* ── Hasil klaim & vendor ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {stats.outcome.decided > 0 && (
          <div className="card">
            <h3 style={{ margin: "0 0 0.25rem" }}>Hasil Klaim</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 0.85rem" }}>
              Dari {stats.outcome.decided} klaim yang sudah diputus vendor. Klaim yang masih
              berjalan belum dihitung.
            </p>

            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <span style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
                {stats.outcome.successRate}%
              </span>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                disetujui ({stats.outcome.approved} dari {stats.outcome.decided})
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {decisionEntries.map(([decision, count]) => (
                <span
                  key={decision}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: decision === "rejected" ? "#fef2f2" : "var(--cream)",
                    border: `1px solid ${decision === "rejected" ? "#fecaca" : "var(--border)"}`,
                    color: decision === "rejected" ? "#991b1b" : undefined,
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

        {stats.vendors.length > 0 && (
          <div className="card">
            <h3 style={{ margin: "0 0 0.25rem" }}>Case per Vendor</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
              Yang masih berjalan, menunggu terlama di atas.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {stats.vendors.map((v) => (
                <li
                  key={v.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.55rem 0",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {v.open} case
                    </span>
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        borderRadius: "999px",
                        padding: "0.15rem 0.55rem",
                        background: v.oldestDays >= VENDOR_OVERDUE_DAYS ? "#fef2f2" : "var(--cream)",
                        color: v.oldestDays >= VENDOR_OVERDUE_DAYS ? "#991b1b" : "var(--text-secondary)",
                        border: `1px solid ${v.oldestDays >= VENDOR_OVERDUE_DAYS ? "#fecaca" : "var(--border)"}`,
                      }}
                    >
                      {v.oldestDays} hari
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Aktivitas pindah ke halaman sendiri: dashboard ini untuk bertindak,
          bukan untuk membaca riwayat. */}
      <Link
        href="/rma/logs"
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0 }}>
          <History size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600 }}>Log Aktivitas</span>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Riwayat perpindahan status semua case, bisa difilter.
            </span>
          </span>
        </span>
        <span style={{ color: "var(--primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
          Buka →
        </span>
      </Link>
    </div>
  );
}
