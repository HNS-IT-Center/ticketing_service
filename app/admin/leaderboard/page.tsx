// Admin leaderboard — live design with Technician and Store (Team vs Team) standings
import { requireRole } from "@/lib/session";
import { Trophy, Crown, Medal, Store, Users, User } from "lucide-react";
import Link from "next/link";
import { getLeaderboardData, MONTH_COLORS, getMonthFromKey, getShortLabel } from "@/lib/leaderboard";

export const metadata = { title: "Leaderboard — Admin — HNS IT Center" };

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tab?: string }>;
}) {
  await requireRole("Administrator", "Sales");
  const params = await searchParams;

  const now = new Date();
  const monthParam = params.month || "";
  const year  = parseInt(params.year  || String(now.getFullYear()));
  const month = monthParam && monthParam !== "all" ? parseInt(monthParam) : null;
  const tab   = params.tab || "technician";

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Cached fetch — only refetches when a ticket completes (revalidateTag)
  const { rankedTechs, rankedStores } = await getLeaderboardData(month, year);

  const isStoreTab = tab === "store";
  const ranked     = isStoreTab ? rankedStores : rankedTechs;
  const noData     = ranked.every((r) => r.points === 0);

  const top5   = ranked.slice(0, 5);
  const first  = ranked[0], second = ranked[1], third = ranked[2];
  const maxPts = first?.points || 1;

  const RANK_CONFIG = [
    { color: "#f59e0b", glow: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.6)", barH: 180, avatarSize: "4rem", fontSize: "1.125rem" },
    { color: "#9ca3af", glow: "transparent", bg: "rgba(156,163,175,0.18)", border: "rgba(156,163,175,0.5)", barH: 130, avatarSize: "3.5rem", fontSize: "1rem" },
    { color: "#b45309", glow: "transparent", bg: "rgba(180,83,9,0.18)", border: "rgba(180,83,9,0.5)", barH: 100, avatarSize: "3rem", fontSize: "0.9rem" },
  ];

  const buildTabHref = (nextTab: string) => {
    const qs = new URLSearchParams();
    if (monthParam) qs.set("month", monthParam);
    if (params.year) qs.set("year", params.year);
    qs.set("tab", nextTab);
    return `/admin/leaderboard?${qs.toString()}`;
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <Trophy size={26} className="text-amber-500" />
            Leaderboard Standings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Live standings for {month ? MONTHS[month - 1] : "All months"} {year} · Auto-updates on ticket completion
          </p>
        </div>
        
        <form className="flex gap-2 items-center flex-wrap">
          {tab && <input type="hidden" name="tab" value={tab} />}
          <select name="month" defaultValue={month ?? "all"} className="form-input" style={{ width: "auto" }}>
            <option value="all">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="year" defaultValue={year} className="form-input" style={{ width: "auto" }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>

      {/* Tab Toggles */}
      <div className="flex gap-2">
        <Link href={buildTabHref("technician")} className={`btn btn-sm flex items-center gap-1.5 ${!isStoreTab ? "btn-primary" : "btn-outline"}`}>
          <User size={15} /> Technicians
        </Link>
        <Link href={buildTabHref("store")} className={`btn btn-sm flex items-center gap-1.5 ${isStoreTab ? "btn-primary" : "btn-outline"}`}>
          <Store size={15} /> Store Standings
        </Link>
      </div>

      {noData ? (
        <div className="card">
          <div className="empty-state">
            <Trophy size={48} className="opacity-20" />
            <p>No completed tickets for {month ? MONTHS[month - 1] : "this year"} {year}.</p>
          </div>
        </div>
      ) : (
        <>
          {isStoreTab ? (
            <div className="flex flex-col gap-6 w-full mt-4">
              <div className="text-center mb-2">
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-wider flex items-center justify-center gap-2">
                  <span className="text-red-500">⚔️</span> Team vs Team Showdown <span className="text-red-500">⚔️</span>
                </h2>
                <p className="text-gray-500 mt-1">Which store will dominate the leaderboard?</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rankedStores.map((store, i) => {
                  const isFirst  = i === 0 && store.points > 0;
                  const isSecond = i === 1 && store.points > 0;
                  const isThird  = i === 2 && store.points > 0;
                  const borderColor = isFirst ? "#f59e0b" : isSecond ? "#9ca3af" : isThird ? "#b45309" : "var(--border-light)";
                  const bgGradient  = isFirst ? "linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.02) 100%)" : "var(--white)";
                  return (
                    <div key={store.id} className="card relative overflow-hidden flex flex-col items-center p-6 border-2" style={{ borderColor, background: bgGradient, transition: "transform 0.2s" }}>
                      {isFirst  && <div className="absolute top-0 right-0 bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow flex items-center gap-1"><Crown size={12}/> 1st Place</div>}
                      {isSecond && <div className="absolute top-0 right-0 bg-gray-400 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow">2nd Place</div>}
                      {isThird  && <div className="absolute top-0 right-0 bg-amber-700 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow">3rd Place</div>}
                      <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black mb-3 border-4 shadow-lg bg-primary text-white" style={{ borderColor: isFirst ? "#f59e0b" : "white" }}>
                        {store.code}
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 text-center mb-1">{store.name}</h3>
                      <div className="text-sm text-gray-500 mb-5 inline-flex w-fit items-center gap-1.5 bg-gray-100 px-4 py-1.5 rounded-full">
                        <Users size={14} className="text-gray-600" /> {store.techCount} Technicians
                      </div>
                      <div className="w-full bg-white rounded-xl p-4 text-center border shadow-sm" style={{ borderColor: isFirst ? "rgba(245, 158, 11, 0.3)" : "var(--border-light)" }}>
                        <div className="text-4xl font-extrabold mb-1" style={{ color: isFirst ? "#f59e0b" : "var(--primary)" }}>
                          {store.points} <span className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1">Pts</span>
                        </div>
                        <div className="text-xs text-gray-500 font-medium">{store.tickets} tickets completed</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="leaderboard-layout">
              {/* Main Visual Panels */}
              <div className="leaderboard-chart flex flex-col gap-4">
                
                {/* Podium */}
            <div className="card overflow-hidden border-none p-0" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #16469d 60%, #2557bb 100%)" }}>
              <div className="pt-4 px-6 flex items-center gap-2">
                <Trophy size={18} className="text-amber-500" />
                <span className="font-bold text-[0.9375rem]" style={{ color: "rgba(255, 255, 255, 0.9)" }}>Top Performers</span>
              </div>
              
              <div className="flex justify-center items-end gap-3 pt-6 px-4" style={{ minHeight: "280px" }}>
                {/* 2nd */}
                {second && (() => { const cfg = RANK_CONFIG[1]; return (
                  <div className="flex flex-col items-center flex-none w-[100px]">
                    <div className="flex flex-col items-center gap-1 mb-2">
                      <Crown size={18} style={{ color: cfg.color }} />
                      <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width:cfg.avatarSize, height:cfg.avatarSize, background:cfg.bg, border:`2px solid ${cfg.border}`, fontSize:cfg.fontSize }}>
                        {getInitials(second.name)}
                      </div>
                      <span className="text-xs font-semibold text-white/90 text-center max-w-[90px] truncate">{second.name}</span>
                      <span className="text-[0.7rem] text-white/60">{second.points} pts</span>
                    </div>
                    <div className="w-full rounded-t-md border flex items-center justify-center origin-bottom animate-[growBar_0.8s_0.2s_ease_both]" style={{ height:`${cfg.barH}px`, background:cfg.bg, borderColor:cfg.border }}>
                      <span className="text-3xl font-black" style={{ color:cfg.color }}>2</span>
                    </div>
                  </div>
                ); })()}
                
                {/* 1st */}
                {first && (() => { const cfg = RANK_CONFIG[0]; return (
                  <div className="flex flex-col items-center flex-none w-[120px]">
                    <div className="flex flex-col items-center gap-1 mb-2">
                      <Crown size={26} style={{ color:cfg.color, filter:`drop-shadow(0 0 8px ${cfg.glow})` }} />
                      <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width:cfg.avatarSize, height:cfg.avatarSize, background:cfg.bg, border:`2px solid ${cfg.border}`, boxShadow:`0 0 20px ${cfg.glow}`, fontSize:cfg.fontSize }}>
                        {getInitials(first.name)}
                      </div>
                      <span className="text-sm font-bold text-white text-center max-w-[110px] truncate">{first.name}</span>
                      <span className="text-xs font-semibold text-amber-300">{first.points} pts</span>
                    </div>
                    <div className="w-full rounded-t-md border flex items-center justify-center origin-bottom animate-[growBar_0.8s_ease_both]" style={{ height:`${cfg.barH}px`, background:cfg.bg, borderColor:cfg.border, boxShadow:`0 -6px 24px ${cfg.glow}` }}>
                      <span className="text-5xl font-black text-amber-500">1</span>
                    </div>
                  </div>
                ); })()}
                
                {/* 3rd */}
                {third && (() => { const cfg = RANK_CONFIG[2]; return (
                  <div className="flex flex-col items-center flex-none w-[100px]">
                    <div className="flex flex-col items-center gap-1 mb-2">
                      <Crown size={16} style={{ color: cfg.color }} />
                      <div className="rounded-full flex items-center justify-center font-bold text-white font-mono" style={{ width:cfg.avatarSize, height:cfg.avatarSize, background:cfg.bg, border:`2px solid ${cfg.border}`, fontSize:cfg.fontSize }}>
                        {getInitials(third.name)}
                      </div>
                      <span className="text-xs font-semibold text-white/90 text-center max-w-[90px] truncate">{third.name}</span>
                      <span className="text-[0.7rem] text-white/60">{third.points} pts</span>
                    </div>
                    <div className="w-full rounded-t-md border flex items-center justify-center origin-bottom animate-[growBar_0.8s_0.4s_ease_both]" style={{ height:`${cfg.barH}px`, background:cfg.bg, borderColor:cfg.border }}>
                      <span className="text-[1.75rem] font-black text-amber-700">3</span>
                    </div>
                  </div>
                ); })()}
              </div>
              <div style={{ height:"8px", background:"rgba(255, 255, 255, 0.12)", borderTop:"1px solid rgba(255, 255, 255, 0.18)" }} />
            </div>

            {/* Progress Bars */}
            {top5.length > 0 && (
              <div className="card p-5">
                <h3 style={{ fontSize:"0.875rem", fontWeight:700, color:"var(--text-secondary)", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                  Top 5 — Points Breakdown
                </h3>
                <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
                  {top5.map((t, i) => {
                    const pct = Math.round((t.points / maxPts) * 100);
                    const barColor = i===0?"#f59e0b":i===1?"#9ca3af":i===2?"#b45309":"var(--primary)";
                    return (
                      <div key={t.id} style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                        <span style={{ width:"1.5rem", textAlign:"right", fontWeight:700, fontSize:"0.875rem", color:barColor, flexShrink:0 }}>#{i+1}</span>
                        <span style={{ width:"7rem", fontSize:"0.875rem", fontWeight:500, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                        <div style={{ flex:1, background:"var(--cream-dark)", borderRadius:"999px", height:"10px", overflow:"hidden" }}>
                          <div style={{ height:"100%",width:`${pct}%`,borderRadius:"999px",background:barColor,animation:`growBar 0.8s ${i*0.1}s ease both`,transformOrigin:"left" }} />
                        </div>
                        <span style={{ width:"3.5rem", textAlign:"right", fontSize:"0.875rem", fontWeight:700, color:barColor, flexShrink:0 }}>{t.points} pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Side List — All Rankings */}
          <div className="leaderboard-list">
            <div style={{ padding:"0.75rem 0", borderBottom:"1px solid var(--border-light)", marginBottom:"0.5rem" }}>
              <h3 style={{ fontSize:"0.875rem", fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                All Rankings
              </h3>
            </div>
            
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
              {rankedTechs.map((t, i) => {
                const rank        = i + 1;
                const isTop3      = rank <= 3;
                const medalColor  = rank===1?"#f59e0b":rank===2?"#9ca3af":rank===3?"#b45309":"var(--text-muted)";
                const bgStyle     = isTop3 ? "rgba(22, 70, 157, 0.08)" : "var(--white)";
                const borderStyle = isTop3 ? "rgba(22, 70, 157, 0.2)" : "var(--border-light)";

                const titleBadge = t.activeTitleLabel && t.activeTitleEmoji && t.activeTitle ? (() => {
                  const mo = getMonthFromKey(t.activeTitle);
                  const mc = MONTH_COLORS[mo] ?? MONTH_COLORS[1];
                  return { label: getShortLabel(t.activeTitleLabel, t.activeTitleEmoji), bg: mc.bg, text: mc.text };
                })() : null;

                return (
                  <div key={t.id} style={{ display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.75rem 0.875rem",background:bgStyle,border:`1.5px solid ${borderStyle}`,borderRadius:"var(--radius-md)",animation:`fadeIn 0.4s ${i*0.05}s ease both` }}>
                    <div style={{ width:"2rem",height:"2rem",borderRadius:"50%",flexShrink:0,background:isTop3?`${medalColor}20`:"var(--cream)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                      {rank<=3 ? <Medal size={14} style={{ color:medalColor }} /> : <span style={{ fontSize:"0.75rem", fontWeight:700, color:"var(--text-muted)" }}>{rank}</span>}
                    </div>
                    
                    <div style={{ width:"2.25rem",height:"2.25rem",borderRadius:"50%",flexShrink:0,background:"var(--primary)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,border:isTop3?"1.5px solid rgba(255,255,255,0.3)":"none",fontFamily:"monospace" }}>
                      {getInitials(t.name)}
                    </div>
                    
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"0.875rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</div>
                      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                        <span>{t.tickets} ticket{t.tickets!==1?"s":""}</span>
                        {titleBadge && (
                          <span style={{
                            display: "inline-block",
                            padding: "0.1rem 0.45rem",
                            borderRadius: "999px",
                            background: titleBadge.bg,
                            color: titleBadge.text,
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            whiteSpace: "nowrap",
                          }}>
                            {titleBadge.label}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <span style={{ fontWeight:800, fontSize:"0.9375rem", color:isTop3?medalColor:"var(--primary)", flexShrink:0 }}>
                      {t.points}<span style={{ fontSize:"0.7rem", fontWeight:500, color:"var(--text-muted)", marginLeft:"2px" }}>pts</span>
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
