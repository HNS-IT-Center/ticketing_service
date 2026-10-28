"use client";

import { useEffect, useState } from "react";
import { Crown, Swords, Users, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreEntry = {
  id: string;
  name: string;
  code: string;
  points: number;
  tickets: number;
  techCount: number;
};

const RANK_META = [
  { label: "1st", medal: "🥇", barColor: "#f59e0b", textColor: "#f59e0b", borderColor: "rgba(245,158,11,0.6)", glowColor: "rgba(245,158,11,0.25)", ringColor: "#f59e0b" },
  { label: "2nd", medal: "🥈", barColor: "#9ca3af", textColor: "#9ca3af", borderColor: "rgba(156,163,175,0.5)", glowColor: "rgba(156,163,175,0.15)", ringColor: "#9ca3af" },
  { label: "3rd", medal: "🥉", barColor: "#b45309", textColor: "#b45309", borderColor: "rgba(180,83,9,0.4)",   glowColor: "rgba(180,83,9,0.12)",   ringColor: "#b45309" },
];

export function StoreLeaderboard({ rankedStores, maxPts }: { rankedStores: StoreEntry[]; maxPts: number }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const top3 = rankedStores.slice(0, 3).filter(s => s.points > 0);

  return (
    <div className="flex flex-col gap-6">

      {/* ─── Hero: Podium ─── */}
      <div className="overflow-hidden rounded-xl bg-[linear-gradient(135deg,#1e3a5f_0%,#16469d_60%,#2557bb_100%)] shadow-sm">
        <div className="flex items-center justify-center gap-3 px-4 pt-6 pb-3">
          <Swords aria-hidden="true" className="size-5 text-amber-400" />
          <span className="text-center text-base font-black tracking-widest text-white uppercase sm:text-lg">Team vs Team Showdown</span>
          <Swords aria-hidden="true" className="size-5 text-amber-400" />
        </div>
        <p className="pb-5 text-center text-sm text-white/60">Which store dominates this month?</p>

        {/* Top 3 — arranged: 2nd | 1st | 3rd */}
        <div className="flex items-end justify-center gap-2 px-3 sm:gap-4 sm:px-6">
          {([1, 0, 2] as const).map((rankIdx) => {
            const store = top3[rankIdx];
            if (!store) return null;
            const meta  = RANK_META[rankIdx];
            const heights = [220, 160, 130];
            const barH  = heights[rankIdx];
            const isFirst = rankIdx === 0;

            return (
              <div key={store.id} className={cn("flex min-w-0 flex-col items-center", isFirst ? "basis-[160px]" : "basis-[110px] sm:basis-[130px]")}>
                <div className="mb-2">
                  {isFirst
                    ? <Crown aria-hidden="true" className="size-7" style={{ color: meta.barColor, filter: `drop-shadow(0 0 8px ${meta.glowColor})` }} />
                    : <span className="text-2xl">{meta.medal}</span>
                  }
                </div>
                <div
                  className={cn(
                    "mb-2 flex items-center justify-center rounded-full bg-white/15 font-black text-white backdrop-blur-xs",
                    isFirst ? "size-20 text-[1.4rem]" : "size-16 text-[1.1rem]",
                  )}
                  style={{ border: `3px solid ${meta.ringColor}`, boxShadow: isFirst ? `0 0 20px ${meta.glowColor}` : "none" }}
                >
                  {store.code}
                </div>
                <span className="mb-0.5 max-w-[140px] truncate text-center text-sm font-bold text-white">{store.name}</span>
                <span className={cn("mb-3 font-black", isFirst ? "text-base" : "text-[0.85rem]")} style={{ color: meta.barColor }}>
                  {store.points} pts
                </span>
                <div
                  className="flex w-full origin-bottom flex-col items-center justify-center gap-1 rounded-t-lg border-[1.5px] border-b-0"
                  style={{
                    height: `${barH}px`,
                    background: `linear-gradient(to top, ${meta.borderColor}, rgba(255,255,255,0.06))`,
                    borderColor: meta.borderColor,
                    transform: mounted ? "scaleY(1)" : "scaleY(0)",
                    transition: `transform 0.7s ${rankIdx === 0 ? "0s" : rankIdx === 1 ? "0.15s" : "0.3s"} cubic-bezier(0.34,1.4,0.64,1)`,
                    opacity: mounted ? 1 : 0,
                    boxShadow: isFirst ? `0 -8px 30px ${meta.glowColor}` : "none",
                  }}
                >
                  <span className={cn("leading-none font-black", isFirst ? "text-5xl" : "text-[2rem]")} style={{ color: meta.barColor }}>{rankIdx + 1}</span>
                  <span className="text-xs text-white/60">{store.tickets} tickets</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="h-2 border-t border-white/15 bg-white/10" />
      </div>

      {/* ─── Points Breakdown ─── */}
      {top3.length > 0 && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="size-[15px] text-muted-foreground" />
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Points Breakdown</h3>
          </div>
          <ol className="flex flex-col gap-3">
            {rankedStores.filter(s => s.points > 0).map((store, i) => {
              const meta = RANK_META[i] ?? { barColor: "var(--primary)", medal: `#${i + 1}` };
              const pct  = Math.round((store.points / maxPts) * 100);
              return (
                <li key={store.id} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-[0.8rem] font-bold" style={{ color: meta.barColor }}>
                    {i < 3 ? meta.medal : `#${i + 1}`}
                  </span>
                  <span className="w-24 shrink-0 truncate text-[0.85rem] font-semibold sm:w-32">
                    {store.name}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: meta.barColor ?? "var(--primary)",
                        width: mounted ? `${pct}%` : "0%",
                        transition: `width 0.7s ${i * 0.1}s cubic-bezier(0.34,1.4,0.64,1)`,
                      }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[0.85rem] font-bold" style={{ color: meta.barColor ?? "var(--primary)" }}>
                    {store.points} pts
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ─── All Store Cards ─── */}
      <section className="flex flex-col gap-3">
        <h3 className="border-b border-border pb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
          All Rankings
        </h3>
        <ol className="flex flex-col gap-3">
          {rankedStores.map((store, i) => {
            const meta = RANK_META[i];
            const hasPoints = store.points > 0;
            return (
              <li
                key={store.id}
                className={cn(
                  "flex items-center gap-4 rounded-xl border-[1.5px] px-4 py-3",
                  i === 0 && hasPoints ? "bg-[linear-gradient(135deg,rgba(245,158,11,0.06)_0%,white_100%)]" : "bg-card",
                  !(meta && hasPoints) && "border-border",
                )}
                style={{
                  borderColor: meta && hasPoints ? meta.borderColor : undefined,
                  transform: mounted ? "translateY(0)" : "translateY(16px)",
                  opacity: mounted ? 1 : 0,
                  transition: `transform 0.5s ${i * 0.08}s ease, opacity 0.5s ${i * 0.08}s ease`,
                }}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground",
                    !(meta && hasPoints) && "border-2 border-border",
                  )}
                  style={meta && hasPoints ? { border: `2.5px solid ${meta.ringColor}` } : undefined}
                >
                  {store.code}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    {meta && hasPoints && <span className="text-sm">{meta.medal}</span>}
                    {!meta && hasPoints && <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>}
                    <span className="truncate text-sm font-bold">{store.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                    <Users aria-hidden="true" className="size-[11px]" />
                    <span>{store.techCount} Technicians</span>
                    <span aria-hidden="true">·</span>
                    <Trophy aria-hidden="true" className="size-[11px]" />
                    <span>{store.tickets} tickets</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-lg font-extrabold" style={{ color: meta && hasPoints ? meta.textColor : "var(--primary)" }}>
                    {store.points} <span className="text-[0.65rem] font-medium text-muted-foreground">pts</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

    </div>
  );
}
