import Link from "next/link";
import ChartSlider, { type Slide } from "@/components/toko/ChartSlider";
import { HorizontalBars, type BarItem } from "@/components/toko/Charts";
import { cn } from "@/lib/utils";
import type { Share } from "@/lib/rma/claim-dashboard";
import {
  ageShares,
  daysInStage,
  ENDED_STAGES,
  longestWaiting,
  OPEN_STAGES,
  stageBreakdown,
  stageCounts,
  stageLabel,
  type ClaimStage,
  type PositionUnit,
} from "@/lib/rma/unit-position";

const bars = (rows: Share[]): BarItem[] =>
  rows.map((r) => ({ key: r.key, label: r.label, value: r.count, display: String(r.count), muted: r.muted }));

/**
 * "Posisi Unit Sekarang": a strip of every open stage with its count (always
 * visible), the ended stages small beside it, then one slide per stage that
 * holds units — age in the stage, where the units are, and the longest waits.
 * A count opens the Klaim Garansi list filtered to that stage, for viewers who
 * may open that list.
 */
export function UnitPosition({
  units,
  now,
  owner,
  linkList,
  linkCases,
}: {
  units: PositionUnit[];
  now: number;
  /** The page's Kepemilikan filter, carried into the list links. */
  owner?: string;
  linkList: boolean;
  linkCases: boolean;
}) {
  const counts = stageCounts(units);
  const openTotal = OPEN_STAGES.reduce((n, s) => n + counts[s], 0);
  const listHref = (s: ClaimStage) => `/rma/tickets?status=${s}${owner ? `&owner=${owner}` : ""}`;

  const slides: Slide[] = OPEN_STAGES.filter((s) => counts[s] > 0).map((stage) => {
    const inStage = units.filter((u) => u.stage === stage);
    const breakdown = stageBreakdown(inStage);
    return {
      key: stage,
      title: `${stageLabel(stage)} · ${inStage.length} unit`,
      subtitle: "Lama di tahap ini, posisi unit, dan yang paling lama menunggu",
      content: (
        <div className="flex flex-col gap-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Lama di tahap ini</h3>
              <HorizontalBars items={bars(ageShares(inStage, now))} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{breakdown.title}</h3>
              <div className="max-h-56 overflow-y-auto pr-1">
                <HorizontalBars items={bars(breakdown.rows)} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-muted-foreground">Paling lama menunggu</h3>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {longestWaiting(inStage).map((u) => {
                const days = daysInStage(u, now);
                const label = (
                  <>
                    <span className="font-semibold text-foreground">{u.rmaCode ?? u.ticketCode}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {u.device ?? "—"}
                      {u.vendor ? ` · ${u.vendor}` : ""}
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", days >= 30 ? "text-destructive" : "text-foreground")}>{days} hari</span>
                  </>
                );
                const row = "flex min-h-11 items-center gap-3 px-3 py-2 text-sm";
                return (
                  <li key={u.ticketCode}>
                    {linkCases && u.caseId ? (
                      <Link href={`/rma/cases/${u.caseId}`} className={cn(row, "hover:bg-muted")}>
                        {label}
                      </Link>
                    ) : (
                      <div className={row}>{label}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ),
    };
  });

  const box = (stage: ClaimStage) => {
    const n = counts[stage];
    const inner = (
      <>
        <span className="text-xs leading-tight font-semibold text-foreground">{stageLabel(stage)}</span>
        <span className={cn("text-2xl leading-none font-bold tabular-nums", n > 0 ? "text-primary" : "text-muted-foreground")}>{n}</span>
      </>
    );
    const cls = cn(
      "flex min-h-20 min-w-[7.5rem] shrink-0 snap-start flex-col justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs md:min-w-0",
      n === 0 && "opacity-60",
    );
    return linkList ? (
      <Link key={stage} href={listHref(stage)} className={cn(cls, "transition-colors hover:border-primary hover:bg-muted")}>
        {inner}
      </Link>
    ) : (
      <div key={stage} className={cls}>
        {inner}
      </div>
    );
  };

  return (
    <section aria-label="Posisi unit sekarang" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground">Posisi unit sekarang · per hari ini</h2>
        <p className="text-xs text-muted-foreground">Tidak ikut filter Bulan; ikut Lokasi, Kepemilikan, dan Status.</p>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible xl:grid-cols-8">
        {OPEN_STAGES.map(box)}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          Masih jalan: <strong className="text-foreground tabular-nums">{openTotal}</strong> unit
        </span>
        <span aria-hidden>·</span>
        <span>Sudah berakhir:</span>
        {ENDED_STAGES.map((s) =>
          linkList ? (
            <Link key={s} href={listHref(s)} className="underline-offset-2 hover:text-foreground hover:underline">
              {stageLabel(s)} <strong className="text-foreground tabular-nums">{counts[s]}</strong>
            </Link>
          ) : (
            <span key={s}>
              {stageLabel(s)} <strong className="text-foreground tabular-nums">{counts[s]}</strong>
            </span>
          ),
        )}
      </p>
      {slides.length > 0 ? (
        <ChartSlider slides={slides} label="Rincian unit per tahap" noun="Tahap" />
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Tidak ada unit yang sedang diproses.
        </p>
      )}
    </section>
  );
}
