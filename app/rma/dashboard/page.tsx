import { requirePage } from "@/lib/page-access";
import Link from "next/link";
import type { RmaStatus } from "@prisma/client";
import { getRmaQueue, PRE_HANDOVER_SLA, RMA_STAGE_SLA, VENDOR_OVERDUE_DAYS, type RmaLane, type RmaQueueRow } from "@/lib/rma/queue";
import AttentionCard, { PreHandoverCard } from "./AttentionCard";
import { rmaDecisionLabel } from "@/lib/rma/decision";
import { accessFor } from "@/lib/access-server";
import { BarChart3, CheckCircle, CheckCircle2, ChevronDown, Clock, Factory, History, Inbox, UserX, Wrench } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard RMA — HNS IT Center" };

type Stage = { key: RmaStatus; title: string; hint: string };

/**
 * The queue by whose turn it is (BL28c, owner 2026-10-03): the desk, the
 * vendor, the technician. Each stage prints its own targets, because those
 * targets decide every colour, count and order on this page.
 */
const LANES: { lane: RmaLane; title: string; hint: string; icon: typeof Inbox; stages: Stage[] }[] = [
  {
    lane: "desk",
    title: "Giliran RMA",
    hint: "Tidak bergerak sampai meja RMA bertindak.",
    icon: Inbox,
    stages: [
      { key: "pending_verification", title: "Baru Masuk", hint: "Unit baru diserahkan teknisi. Periksa dokumen, SN, dan fisik." },
      { key: "on_hold", title: "Ditahan", hint: "Menunggu kelengkapan dari customer atau alasan lain. Selesaikan atau batalkan." },
      { key: "verified", title: "Siap Diajukan ke Vendor", hint: "Sudah diverifikasi. Pilih vendor dan ajukan." },
      { key: "vendor_decided", title: "Keputusan Keluar", hint: "Vendor sudah memutus. Terima unitnya kembali." },
      { key: "unit_received", title: "Unit Diterima", hint: "Tutup case agar tiket lanjut ke serah terima." },
    ],
  },
  {
    lane: "vendor",
    title: "Giliran Vendor",
    hint: "Di tangan vendor. Kejar yang lewat tenggat.",
    icon: Factory,
    stages: [
      { key: "submitted_to_vendor", title: "Diajukan ke Vendor", hint: "Menunggu konfirmasi vendor." },
      { key: "in_vendor_process", title: "Diproses Vendor", hint: "Menunggu keputusan vendor." },
    ],
  },
  {
    lane: "technician",
    title: "Giliran Teknisi",
    hint: "Menunggu teknisi: unit belum diserahkan, atau bukti yang diminta belum dikirim.",
    icon: Wrench,
    stages: [{ key: "on_hold", title: "Ditahan, Menunggu Bukti Teknisi", hint: "Video, foto, atau nota yang diminta meja RMA belum dikirim." }],
  },
];

const CARD = "flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs md:p-5";
const CARD_TITLE = "text-base font-semibold text-foreground";
const CARD_HINT = "mt-0.5 text-[0.8125rem] text-muted-foreground";

export default async function RmaDashboardPage() {
  const session = await requirePage("page_rma_dashboard");
  // Loaded in lib/rma/queue.ts so every clock-derived number comes from a
  // single instant, outside any component render.
  const [{ rows, awaitingCheck, stats }, access] = await Promise.all([getRmaQueue(), accessFor(session.userId)]);
  const linkTickets = access.can("page_tickets_all");

  const inStage = (lane: RmaLane, status: RmaStatus): RmaQueueRow[] => rows.filter((r) => r.lane === lane && r.status === status);
  const decisionEntries = Object.entries(stats.decisions).filter(([, n]) => n > 0);
  const nothing = rows.length === 0 && awaitingCheck.length === 0;

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="rma-dashboard" className="flex flex-col gap-6">
      <PageHeader title="Dashboard RMA" description="Siapa yang harus bergerak, dan berapa lama case sudah menunggu di tahapnya." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        <StatCard icon={Inbox} value={stats.needsAction} label="Giliran RMA" hint="Menunggu meja RMA" tone={stats.needsAction > 0 ? "warning" : "default"} />
        <StatCard
          icon={Factory}
          value={stats.atVendor}
          label="Di Vendor"
          hint={stats.overdue > 0 ? `${stats.overdue} lewat ${VENDOR_OVERDUE_DAYS} hari, perlu dikejar` : "Diajukan atau sedang diproses"}
        />
        <StatCard
          icon={Wrench}
          value={stats.withTechnician}
          label="Di Teknisi"
          hint={stats.technicianLate > 0 ? `${stats.technicianLate} lewat tenggat` : "Belum diserahkan atau menunggu bukti"}
          tone={stats.technicianLate > 0 ? "attention" : "default"}
        />
        {/* The sum of the red pills on the three lanes below. */}
        <StatCard
          icon={Clock}
          value={stats.pastDue + stats.preHandoverLate}
          label="Lewat Tenggat"
          hint={
            stats.preHandoverLate > 0
              ? `${stats.pastDue} case · ${stats.preHandoverLate} klaim belum diserahkan`
              : stats.oldestOpenDays > 0
                ? `Case terlama ${stats.oldestOpenDays} hari`
                : "Melewati target tahapnya"
          }
          tone={stats.pastDue + stats.preHandoverLate > 0 ? "attention" : "default"}
        />
        <StatCard
          icon={UserX}
          value={stats.unassigned}
          label="Tanpa PIC"
          hint={stats.unassigned > 0 ? "Belum ada yang memegang" : "Semua case ada pemiliknya"}
          tone={stats.unassigned > 0 ? "warning" : "default"}
        />
      </div>

      {nothing ? (
        <EmptyState
          icon={CheckCircle2}
          title="Tidak ada klaim yang berjalan."
          description="Klaim muncul di sini sejak tiketnya dibuat, dan jadi case setelah teknisi menyerahkan unit."
        />
      ) : (
        LANES.map(({ lane, title, hint, icon: Icon, stages }) => {
          const laneRows = rows.filter((r) => r.lane === lane);
          const pre = lane === "technician" ? awaitingCheck : [];
          const count = laneRows.length + pre.length;
          const late = laneRows.filter((r) => r.severity === "overdue").length + pre.filter((t) => t.severity === "overdue").length;
          const active = stages.filter((s) => inStage(lane, s.key).length > 0);
          const empty = stages.filter((s) => inStage(lane, s.key).length === 0);
          return (
            <section key={lane} aria-labelledby={`lane-${lane}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Icon aria-hidden="true" className={cn("size-[18px] shrink-0 self-center", late > 0 ? "text-destructive" : "text-muted-foreground")} />
                  <h2 id={`lane-${lane}`} className="text-[1.0625rem] font-semibold text-foreground">
                    {title}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {count} {lane === "technician" ? "klaim" : "case"} · {hint}
                  </span>
                </div>
                {late > 0 && (
                  <span className="rounded-full border border-tone-red-border bg-tone-red-bg px-3 py-0.5 text-[0.8125rem] font-semibold text-tone-red-fg">
                    {late} melewati tenggat
                  </span>
                )}
              </div>

              {count === 0 ? (
                <p className="flex items-center gap-2 rounded-xl border border-tone-green-border bg-tone-green-bg px-4 py-3 text-sm text-tone-green-fg">
                  <CheckCircle aria-hidden="true" className="size-4 shrink-0" /> Tidak ada yang menunggu di sini.
                </p>
              ) : (
                // Columns, not a grid: cards of different heights stack without
                // leaving the holes a two-column grid left beside a long card.
                <div className="-mb-4 columns-1 gap-4 lg:columns-2">
                  {pre.length > 0 && <PreHandoverCard rows={pre} sla={PRE_HANDOVER_SLA} linkTickets={linkTickets} />}
                  {active.map((s) => (
                    <AttentionCard key={s.key} title={s.title} hint={s.hint} rows={inStage(lane, s.key)} sla={RMA_STAGE_SLA[s.key]} />
                  ))}
                </div>
              )}

              {count > 0 && empty.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
                  <CheckCircle aria-hidden="true" className="size-3.5 text-tone-green-fg" />
                  Kosong:
                  {empty.map((s) => (
                    <span key={s.key}>{s.title}</span>
                  ))}
                </p>
              )}
            </section>
          );
        })
      )}

      {/* History, not today's work: folded by default at every width. */}
      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold md:px-5 [&::-webkit-details-marker]:hidden">
          Statistik jangka panjang
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid items-start gap-4 border-t border-border p-3 md:p-4 lg:grid-cols-3">
          <section className={CARD}>
            <h3 className={CARD_TITLE}>Rata-rata Selesai</h3>
            <p className={CARD_HINT}>Dari case dibuka sampai ditutup.</p>
            {stats.resolution.sample === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada case yang ditutup.</p>
            ) : (
              <>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl leading-none font-bold tabular-nums">{stats.resolution.thisMonth ?? stats.resolution.overall}</span>
                  <span className="text-sm text-muted-foreground">hari {stats.resolution.thisMonth !== null ? "bulan ini" : "rata-rata"}</span>
                </p>
                <p className="mt-2 text-[0.8125rem] text-muted-foreground">
                  {stats.resolution.thisMonth !== null && stats.resolution.previous !== null
                    ? stats.resolution.thisMonth < stats.resolution.previous
                      ? `Lebih cepat dari ${stats.resolution.previous} hari sebelumnya.`
                      : stats.resolution.thisMonth > stats.resolution.previous
                        ? `Lebih lambat dari ${stats.resolution.previous} hari sebelumnya.`
                        : "Sama dengan sebelumnya."
                    : `Dari ${stats.resolution.sample} case tertutup.`}
                </p>
              </>
            )}
          </section>

          <section className={CARD}>
            <h3 className={CARD_TITLE}>Hasil Klaim</h3>
            <p className={CARD_HINT}>Klaim yang sudah diputus vendor. Yang masih berjalan belum dihitung.</p>
            {stats.outcome.decided === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada keputusan vendor.</p>
            ) : (
              <>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl leading-none font-bold tabular-nums">{stats.outcome.successRate}%</span>
                  <span className="text-sm text-muted-foreground">
                    disetujui ({stats.outcome.approved} dari {stats.outcome.decided})
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {decisionEntries.map(([decision, count]) => (
                    <span
                      key={decision}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem]",
                        decision === "rejected" ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg" : "border-border bg-muted",
                      )}
                    >
                      {rmaDecisionLabel(decision)}
                      <strong>{count}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
            {/* Brand and kind of goods come from the Accurate catalogue there,
                not from the first word of a typed name (BL28). */}
            {access.can("page_rma_analysis") && (
              <Link href="/rma/analisa" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <BarChart3 aria-hidden="true" className="size-4" /> Klaim per brand dan jenis barang di Analisa Klaim →
              </Link>
            )}
          </section>

          <section className={CARD}>
            <h3 className={CARD_TITLE}>Case per Vendor</h3>
            <p className={CARD_HINT}>Yang masih berjalan, menunggu terlama di atas.</p>
            {stats.vendors.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Tidak ada case di vendor.</p>
            ) : (
              <ul className="mt-2">
                {stats.vendors.map((v) => (
                  <li key={v.name} className="flex items-center justify-between gap-3 border-t border-border py-2.5">
                    <span className="min-w-0 truncate">{v.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[0.8125rem] text-muted-foreground">{v.open} case</span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-semibold",
                          v.oldestDays >= VENDOR_OVERDUE_DAYS ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg" : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {v.oldestDays} hari
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </details>

      {/* Aktivitas pindah ke halaman sendiri: dashboard ini untuk bertindak,
          bukan untuk membaca riwayat. */}
      <Link
        href="/logs?jenis=rma"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-inherit shadow-xs outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:p-5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <History aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-semibold">Log Aktivitas</span>
            <span className="block text-[0.8125rem] text-muted-foreground">Riwayat perpindahan status semua case, bisa difilter.</span>
          </span>
        </span>
        <span className="font-semibold whitespace-nowrap text-primary">Buka →</span>
      </Link>
    </div>
  );
}
