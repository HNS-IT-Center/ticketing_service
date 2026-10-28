"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";

const RANK_CONFIG = [
  { color: "#f59e0b", glow: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.6)", barH: 180, avatarSize: "4rem", fontSize: "1.125rem" },
  { color: "#9ca3af", glow: "transparent",          bg: "rgba(156,163,175,0.18)", border: "rgba(156,163,175,0.5)", barH: 130, avatarSize: "3.5rem", fontSize: "1rem" },
  { color: "#b45309", glow: "transparent",          bg: "rgba(180,83,9,0.18)",   border: "rgba(180,83,9,0.5)",   barH: 100, avatarSize: "3rem",   fontSize: "0.9rem" },
];

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

type RankEntry = { id: string; name: string; points: number };

export function PodiumBars({ first, second, third }: { first?: RankEntry; second?: RankEntry; third?: RankEntry }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Small delay so the browser has painted the 0-height state first
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const barStyle = (barH: number, bg: string, border: string, glow?: string, delay = 0) => ({
    height: `${barH}px`,
    background: bg,
    borderColor: border,
    boxShadow: glow && glow !== "transparent" ? `0 -6px 24px ${glow}` : undefined,
    transform: mounted ? "scaleY(1)" : "scaleY(0)",
    transformOrigin: "bottom",
    transition: `transform 0.7s ${delay}s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ${delay}s ease`,
    opacity: mounted ? 1 : 0,
  });

  return (
    <div className="flex justify-center items-end gap-3 pt-6 px-4 min-h-[280px]">
      {/* 2nd */}
      {second && (() => { const cfg = RANK_CONFIG[1]; return (
        <div className="flex flex-col items-center flex-none w-[100px]">
          <div className="flex flex-col items-center gap-1 mb-2">
            <Crown size={18} style={{ color: cfg.color }} />
            <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width: cfg.avatarSize, height: cfg.avatarSize, background: cfg.bg, border: `2px solid ${cfg.border}`, fontSize: cfg.fontSize }}>
              {getInitials(second.name)}
            </div>
            <span className="text-xs font-semibold text-white/90 text-center max-w-[90px] truncate">{second.name}</span>
            <span className="text-[0.7rem] text-white/60">{second.points} pts</span>
          </div>
          <div className="w-full rounded-t-md border flex items-center justify-center" style={barStyle(cfg.barH, cfg.bg, cfg.border, undefined, 0.2)}>
            <span className="text-3xl font-black" style={{ color: cfg.color }}>2</span>
          </div>
        </div>
      ); })()}

      {/* 1st */}
      {first && (() => { const cfg = RANK_CONFIG[0]; return (
        <div className="flex flex-col items-center flex-none w-[120px]">
          <div className="flex flex-col items-center gap-1 mb-2">
            <Crown size={26} style={{ color: cfg.color, filter: `drop-shadow(0 0 8px ${cfg.glow})` }} />
            <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width: cfg.avatarSize, height: cfg.avatarSize, background: cfg.bg, border: `2px solid ${cfg.border}`, boxShadow: `0 0 20px ${cfg.glow}`, fontSize: cfg.fontSize }}>
              {getInitials(first.name)}
            </div>
            <span className="text-sm font-bold text-white text-center max-w-[110px] truncate">{first.name}</span>
            <span className="text-xs font-semibold text-amber-300">{first.points} pts</span>
          </div>
          <div className="w-full rounded-t-md border flex items-center justify-center" style={barStyle(cfg.barH, cfg.bg, cfg.border, cfg.glow, 0)}>
            <span className="text-5xl font-black text-amber-500">1</span>
          </div>
        </div>
      ); })()}

      {/* 3rd */}
      {third && (() => { const cfg = RANK_CONFIG[2]; return (
        <div className="flex flex-col items-center flex-none w-[100px]">
          <div className="flex flex-col items-center gap-1 mb-2">
            <Crown size={16} style={{ color: cfg.color }} />
            <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width: cfg.avatarSize, height: cfg.avatarSize, background: cfg.bg, border: `2px solid ${cfg.border}`, fontSize: cfg.fontSize }}>
              {getInitials(third.name)}
            </div>
            <span className="text-xs font-semibold text-white/90 text-center max-w-[90px] truncate">{third.name}</span>
            <span className="text-[0.7rem] text-white/60">{third.points} pts</span>
          </div>
          <div className="w-full rounded-t-md border flex items-center justify-center" style={barStyle(cfg.barH, cfg.bg, cfg.border, undefined, 0.4)}>
            <span className="text-[1.75rem] font-black text-amber-700">3</span>
          </div>
        </div>
      ); })()}
    </div>
  );
}

export function Top5Bars({ top5, maxPts }: { top5: RankEntry[]; maxPts: number }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const COLORS = ["#f59e0b", "#9ca3af", "#b45309", "var(--primary)", "var(--primary)"];

  return (
    <ol className="flex flex-col gap-3">
      {top5.map((t, i) => {
        const pct = Math.round((t.points / maxPts) * 100);
        const barColor = COLORS[i] ?? "var(--primary)";
        return (
          <li key={t.id} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right text-sm font-bold" style={{ color: barColor }}>#{i + 1}</span>
            <span className="w-20 shrink-0 truncate text-sm font-medium sm:w-28">{t.name}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full origin-left rounded-full"
                style={{
                  background: barColor,
                  width: mounted ? `${pct}%` : "0%",
                  transition: `width 0.7s ${i * 0.1}s cubic-bezier(0.34,1.56,0.64,1)`,
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-sm font-bold" style={{ color: barColor }}>{t.points} pts</span>
          </li>
        );
      })}
    </ol>
  );
}
