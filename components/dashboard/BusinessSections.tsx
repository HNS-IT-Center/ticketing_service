import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, PackageSearch } from "lucide-react";
import { StatCard } from "@/components/app/StatCard";
import { SERIES_COLORS } from "@/lib/chart-colors";
import ChartSlider, { type Slide } from "@/components/toko/ChartSlider";
import ProgressBar from "@/components/targets/ProgressBar";
import { followupHref } from "@/components/toko/Followups";
import { formatRupiahCompact } from "@/lib/charges";
import { hoursText, typeShares, type Attention, type StoreSummary, type TechnicianSummary, type TechnicianTeam } from "@/lib/admin-dashboard";
import { loadHeldClaims } from "@/lib/admin-dashboard-server";
import { TYPE_LABELS, TYPE_ORDER, type Headline } from "@/lib/trend";
import { TICKET_FILTER_UNASSIGNED } from "@/lib/ticket-list-filter";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("id-ID");

/** "▲ 12% dari Rp 43,0 jt" — the change against the previous period up to the same point. */
export function DeltaHint({ h, money = false }: { h: Headline; money?: boolean }) {
  const prev = money ? formatRupiahCompact(h.previous) : nf.format(h.previous);
  const Icon = h.changePct === null || h.changePct === 0 ? Minus : h.changePct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>
        {h.changePct === null ? "" : <strong className="font-semibold text-foreground">{`${h.changePct > 0 ? "+" : ""}${h.changePct}% `}</strong>}
        dari {prev}
      </span>
    </span>
  );
}

/**
 * Store-stock claims still at the vendor, and — when the catalogue gives harga
 * modal and the viewer may see it — the stock they hold, as one total. Its own
 * component so a slow catalogue does not hold the page (wrapped in Suspense).
 */
export async function HeldClaimsCard({ now, mayValue }: { now: number; mayValue: boolean }) {
  const held = await loadHeldClaims(now, mayValue);
  const href = mayValue ? "/finance/klaim" : undefined;
  if (held.money && held.money.units > held.money.unpriced) {
    return (
      <StatCard
        label="Uang tertahan di klaim vendor"
        value={formatRupiahCompact(held.money.value)}
        icon={PackageSearch}
        tone={held.money.value ? "warning" : "default"}
        href={href}
        hint={`${held.atVendor} klaim stok toko masih di vendor${held.money.unpriced ? `, ${held.money.unpriced} tanpa harga modal` : ""}`}
      />
    );
  }
  return (
    <StatCard
      label="Klaim di vendor"
      value={`${nf.format(held.atVendor)} klaim`}
      icon={PackageSearch}
      tone={held.atVendor ? "warning" : "default"}
      href={href}
      hint={
        mayValue
          ? held.cost === "unavailable"
            ? "Katalog Accurate sedang tidak bisa dihubungi, nilai uangnya belum bisa dihitung."
            : "Nilai uang tertahan muncul setelah izin cost Data Accurate aktif."
          : "Klaim unit stok toko yang masih di vendor."
      }
    />
  );
}

/** A coloured square for a ticket type, the same colour as on every chart. */
function TypeSwatch({ index }: { index: number }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />;
}

export function TypeLegend() {
  return (
    <ul aria-label="Keterangan jenis tiket" className="flex flex-wrap gap-x-4 gap-y-1">
      {TYPE_ORDER.map((t, i) => (
        <li key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TypeSwatch index={i} />
          {TYPE_LABELS[t]}
        </li>
      ))}
    </ul>
  );
}

const sectionTitle = "text-base font-semibold text-foreground md:text-lg";

export function StoreSection({ stores, money }: { stores: StoreSummary[]; money: boolean }) {
  return (
    <section aria-labelledby="per-toko" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="per-toko" className={sectionTitle}>Per toko</h2>
        <Link href="/admin/tickets" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0">
          Semua tiket <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada toko aktif.</p>
      ) : (
        <ul className="flex flex-col">
          {stores.map((s) => {
            const shares = typeShares(s.byType);
            return (
              <li key={s.id} className="flex flex-col gap-2.5 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold text-foreground">{s.name}</span>
                  {money && (
                    <span className="text-right">
                      <span className="font-bold text-foreground tabular-nums">{formatRupiahCompact(s.takings)}</span>
                      {s.unpriced > 0 && <span className="block text-xs text-tone-amber-fg">{s.unpriced} baris belum ada harga</span>}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Masuk <strong className="text-foreground tabular-nums">{nf.format(s.created)}</strong>
                  </span>
                  <span>
                    Selesai <strong className="text-foreground tabular-nums">{nf.format(s.finished)}</strong>
                  </span>
                  <Link
                    href={followupHref("stale", s.id)}
                    className={cn(
                      "ml-auto inline-flex min-h-11 items-center font-semibold hover:underline md:min-h-0",
                      s.followups ? "text-tone-amber-fg" : "text-muted-foreground",
                    )}
                  >
                    {s.followups ? `${nf.format(s.followups)} perlu tindak lanjut` : "Tidak ada tindak lanjut"}
                  </Link>
                </div>
                {shares.length > 0 ? (
                  <div
                    role="img"
                    aria-label={`Komposisi jenis tiket masuk ${s.name}: ${shares.map((x) => `${TYPE_LABELS[x.type]} ${x.count}`).join(", ")}`}
                    className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
                  >
                    {shares.map((x) => (
                      <div
                        key={x.type}
                        title={`${TYPE_LABELS[x.type]} ${x.count}`}
                        className="h-full"
                        style={{ width: `${x.percent}%`, background: SERIES_COLORS[TYPE_ORDER.indexOf(x.type) % SERIES_COLORS.length] }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Belum ada tiket masuk di periode ini.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TypeLegend />
    </section>
  );
}

function TeamMembers({ members, monthText }: { members: TechnicianSummary[]; monthText: string }) {
  return (
    <ol className="flex flex-col">
      {members.map((t, i) => (
        <li key={t.id} className="flex gap-3 border-b border-border py-3.5 first:pt-0 last:border-b-0 last:pb-0">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground tabular-nums">
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="truncate font-semibold text-foreground">{t.name}</span>
              <span className="text-sm text-muted-foreground">
                <strong className="text-base text-foreground tabular-nums">{nf.format(t.points)}</strong> poin
              </span>
            </div>
            {t.target ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  Target {monthText}: {nf.format(t.target.progress.value)} {t.target.measure === "points" ? "poin jasa" : "jasa"}
                </span>
                <ProgressBar progress={t.target.progress} />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Belum ada target {monthText}.</span>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                Selesai <strong className="text-foreground tabular-nums">{nf.format(t.finished)}</strong>
              </span>
              <span>
                Jam kerja <strong className="text-foreground tabular-nums">{hoursText(t.workMs)}</strong>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One slide per store team (owner, 2026-11-13), each ranked by points in the period. */
export function TechnicianSection({ teams, monthText }: { teams: TechnicianTeam[]; monthText: string }) {
  const slides: Slide[] = teams.map((team) => ({
    key: team.storeId ?? "none",
    title: team.name,
    subtitle: `${team.members.length} teknisi · ${nf.format(team.points)} poin · ${nf.format(team.finished)} tiket selesai`,
    content: <TeamMembers members={team.members} monthText={monthText} />,
  }));
  return (
    <section aria-labelledby="per-teknisi" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="per-teknisi" className={sectionTitle}>Per teknisi</h2>
        <Link href="/admin/reports/technicians" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0">
          Target Teknisi <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {slides.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Belum ada teknisi aktif.</p>
      ) : (
        <ChartSlider slides={slides} label="Teknisi per tim toko" noun="Tim" />
      )}
      <p className="text-xs text-muted-foreground">
        Poin dan jam kerja dari tiket yang selesai di periode ini; jeda tidak dihitung, tiket yang poinnya dihapus bernilai 0. Teknisi
        di dua toko tampil di keduanya. Bar target memakai hitungan halaman Target Teknisi untuk bulan berjalan.
      </p>
    </section>
  );
}

const ATTENTION_TONE = {
  red: "bg-tone-red-bg text-tone-red-fg",
  amber: "bg-tone-amber-bg text-tone-amber-fg",
  blue: "bg-tone-blue-bg text-tone-blue-fg",
  gray: "bg-muted text-foreground",
} as const;

/** Today's state, not the period's: four counts, each opening its list. */
export function AttentionRow({ a }: { a: Attention }) {
  const items = [
    { n: a.unassigned, text: "belum ada teknisi", href: `/admin/tickets?status=${TICKET_FILTER_UNASSIGNED}`, tone: "amber" as const },
    { n: a.staleOverdue, text: "belum selesai 7 hari lebih", href: followupHref("stale"), tone: "red" as const },
    { n: a.pickup, text: "siap diambil, belum diambil", href: followupHref("pickup"), tone: "blue" as const },
    { n: a.billing, text: "biaya belum lengkap", href: followupHref("billing"), tone: "gray" as const },
  ];
  return (
    <section aria-labelledby="perlu-perhatian" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs md:flex-row md:flex-wrap md:items-center md:px-5">
      <div className="flex flex-col md:mr-1">
        <h2 id="perlu-perhatian" className="font-semibold text-foreground">Perlu perhatian</h2>
        <p className="text-xs text-muted-foreground">Kondisi saat ini, tidak ikut periode.</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap">
        {items.map((it) => (
          <li key={it.text}>
            <Link
              href={it.href}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
                it.n ? ATTENTION_TONE[it.tone] : "bg-muted text-muted-foreground",
              )}
            >
              <strong className="text-base tabular-nums">{nf.format(it.n)}</strong> {it.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
