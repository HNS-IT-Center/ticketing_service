import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getRmaQueue, RMA_STAGE_SLA, VENDOR_OVERDUE_DAYS } from "@/lib/rma/queue";
import AttentionCard from "./AttentionCard";
import { RMA_DECISION_LABELS } from "@/components/rma/RmaStatusCard";
import { AlertTriangle, Clock, Factory, CheckCircle2, ListChecks, History, CheckCircle, UserX, Timer, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { cn } from "@/lib/utils";

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
    <section className={CARD}>
      <h3 className={CARD_TITLE}>{title}</h3>
      <p className={CARD_HINT}>{hint}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 font-mono text-muted-foreground">
                {row.count} ({Math.round((row.count / total) * 100)}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CARD = "flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs md:p-5";
const CARD_TITLE = "text-base font-semibold text-foreground";
const CARD_HINT = "mt-0.5 text-[0.8125rem] text-muted-foreground";

export default async function RmaDashboardPage() {
  await requireRole("RMA", "Administrator");

  // Loaded in lib/rma/queue.ts so every clock-derived number comes from a
  // single instant, outside any component render.
  const { rows, awaitingCheck, stats } = await getRmaQueue();

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

  // The seven summary numbers, in their original order. The first four are
  // the desk's daily ones; on a phone the last three fold away with the
  // long-term statistics at the bottom of the page.
  const statCards = [
    <StatCard
      key="active"
      icon={ListChecks}
      value={stats.active}
      label="Case Aktif"
      hint={stats.oldestOpenDays > 0 ? `Terlama ${stats.oldestOpenDays} hari` : undefined}
    />,
    <StatCard
      key="needsAction"
      icon={AlertTriangle}
      value={stats.needsAction}
      label="Butuh Tindakan"
      hint="Menunggu verifikasi atau ditahan"
      tone={stats.needsAction > 0 ? "warning" : "default"}
    />,
    <StatCard
      key="atVendor"
      icon={Factory}
      value={stats.atVendor}
      label="Di Vendor"
      hint={
        stats.overdue > 0
          ? `${stats.overdue} lewat ${VENDOR_OVERDUE_DAYS} hari, perlu dikejar`
          : "Diajukan atau sedang diproses"
      }
    />,
    // Counts the same thing as the "melewati tenggat" pill below. Before,
    // this card counted only vendor days over 14 while the pill counted
    // every stage past its own target, so the two disagreed on screen.
    <StatCard
      key="pastDue"
      icon={Clock}
      value={stats.pastDue}
      label="Lewat Tenggat"
      hint="Melewati target tahapannya"
      tone={stats.pastDue > 0 ? "attention" : "default"}
    />,
    <StatCard
      key="unassigned"
      icon={UserX}
      value={stats.unassigned}
      label="Tanpa PIC"
      hint={stats.unassigned > 0 ? "Belum ada yang memegang" : "Semua case ada pemiliknya"}
      tone={stats.unassigned > 0 ? "warning" : "default"}
    />,
    <StatCard
      key="resolution"
      icon={Timer}
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
    />,
    <StatCard
      key="closedThisMonth"
      icon={CheckCircle2}
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
      tone={stats.netThisMonth > 0 ? "warning" : "success"}
    />,
  ];
  const dailyStats = statCards.slice(0, 4);
  const laterStats = statCards.slice(4);

  // Claim breakdowns and outcomes: history, not today's work. Drawn once here,
  // placed twice — in the page flow from md up, folded on a phone.
  const longTerm = (
    <>
      {stats.totalClaims > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {stats.outcome.decided > 0 && (
          <section className={CARD}>
            <h3 className={CARD_TITLE}>Hasil Klaim</h3>
            <p className={CARD_HINT}>
              Dari {stats.outcome.decided} klaim yang sudah diputus vendor. Klaim yang masih
              berjalan belum dihitung.
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl leading-none font-bold tabular-nums">{stats.outcome.successRate}%</span>
              <span className="text-sm text-muted-foreground">
                disetujui ({stats.outcome.approved} dari {stats.outcome.decided})
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {decisionEntries.map(([decision, count]) => (
                <span
                  key={decision}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem]",
                    decision === "rejected"
                      ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg"
                      : "border-border bg-muted",
                  )}
                >
                  {RMA_DECISION_LABELS[decision] ?? decision}
                  <strong>{count}</strong>
                </span>
              ))}
            </div>
          </section>
        )}

        {stats.vendors.length > 0 && (
          <section className={CARD}>
            <h3 className={CARD_TITLE}>Case per Vendor</h3>
            <p className={CARD_HINT}>Yang masih berjalan, menunggu terlama di atas.</p>
            <ul className="mt-2">
              {stats.vendors.map((v) => (
                <li key={v.name} className="flex items-center justify-between gap-3 border-t border-border py-2.5">
                  <span className="min-w-0 truncate">{v.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[0.8125rem] text-muted-foreground">{v.open} case</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-xs font-semibold",
                        v.oldestDays >= VENDOR_OVERDUE_DAYS
                          ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {v.oldestDays} hari
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );

  const statGrid = "grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4";

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="rma-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard RMA"
        description="Pantau case klaim yang sedang berjalan dan aktivitas terakhirnya."
      />

      {/* ── Ringkasan ───────────────────────────────────────────────────── */}
      <div className={statGrid}>
        {dailyStats}
        <div className="hidden md:contents">{laterStats}</div>
      </div>

      {/* ── Menunggu pemeriksaan teknisi (read-only) ─────────────────────── */}
      {awaitingCheck.length > 0 && (
        <section className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className={CARD_TITLE}>Menunggu Pemeriksaan Teknisi</h3>
              <p className={CARD_HINT}>
                Klaim yang sudah masuk tapi unitnya masih dipegang teknisi. Belum bisa
                ditindak dari sini — case RMA baru terbentuk setelah unit diserahkan.
              </p>
            </div>
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap">
              {awaitingCheck.length} tiket
            </span>
          </div>

          <ul className="mt-3">
            {awaitingCheck.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border py-2.5">
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-semibold">
                    #{t.ticket_code}
                    {t.store_location ? ` · ${t.store_location.code}` : ""}
                  </span>
                  <span className="block truncate text-[0.8125rem] text-muted-foreground">
                    {[t.customer_name, t.device_name, t.technician?.name && `PIC ${t.technician.name}`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap",
                      t.status === "on_progress" ? "bg-tone-blue-bg text-tone-blue-fg" : "bg-tone-amber-bg text-tone-amber-fg",
                    )}
                  >
                    {t.status === "on_progress" ? "Diperiksa" : "Belum diambil"}
                  </span>
                  <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">{t.daysWaiting} hari</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Antrean per tahapan ─────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Tidak ada case RMA aktif."
          description="Case muncul di sini setelah teknisi menyerahkan unit klaim ke RMA."
        />
      ) : (
        <>
          {/* Band ringkas: satu angka yang jadi alasan membuka halaman ini. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                aria-hidden="true"
                className={cn("size-[18px]", stats.pastDue > 0 ? "text-destructive" : "text-amber-700")}
              />
              <h2 className="text-[1.0625rem] font-semibold text-foreground">Perlu Perhatian</h2>
              <span className="text-sm text-muted-foreground">{stats.active} case aktif</span>
            </div>
            {stats.pastDue > 0 && (
              <span className="rounded-full border border-tone-red-border bg-tone-red-bg px-3 py-0.5 font-mono text-[0.8125rem] font-semibold text-tone-red-fg">
                {stats.pastDue} melewati tenggat
              </span>
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
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
            <section className="flex flex-col rounded-xl border border-tone-green-border bg-tone-green-bg p-4 md:p-5">
              <div className="flex items-center gap-2 text-tone-green-fg">
                <CheckCircle aria-hidden="true" className="size-[18px]" />
                <h3 className="text-base font-semibold">Tidak ada tunggakan</h3>
              </div>
              <p className="mt-1 mb-3 text-[0.8125rem] text-tone-green-fg">
                Tidak ada case yang menunggu di tahapan berikut.
              </p>
              <ul>
                {clearSections.map((section) => (
                  <li key={section.key} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle aria-hidden="true" className="size-[15px] shrink-0 text-tone-green-fg" />
                      {section.title}
                    </span>
                    <span className="font-mono text-xs whitespace-nowrap text-tone-green-fg">
                      Tenggat {RMA_STAGE_SLA[section.key].overdue} hari
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ── Sebaran klaim, hasil klaim & vendor ─────────────────────────── */}
      <div className="hidden md:contents">{longTerm}</div>
      <details className="group rounded-xl border border-border bg-card md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          Statistik jangka panjang
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-3">{laterStats}</div>
          {longTerm}
        </div>
      </details>

      {/* Aktivitas pindah ke halaman sendiri: dashboard ini untuk bertindak,
          bukan untuk membaca riwayat. */}
      <Link
        href="/rma/logs"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-inherit shadow-xs outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:p-5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <History aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-semibold">Log Aktivitas</span>
            <span className="block text-[0.8125rem] text-muted-foreground">
              Riwayat perpindahan status semua case, bisa difilter.
            </span>
          </span>
        </span>
        <span className="font-semibold whitespace-nowrap text-primary">Buka →</span>
      </Link>
    </div>
  );
}
