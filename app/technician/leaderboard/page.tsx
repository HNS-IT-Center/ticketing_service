import { requirePage } from "@/lib/page-access";
// Technician leaderboard — live design with Technician and Store (Team vs Team) standings
import { requireRole } from "@/lib/session";
import { Trophy, Medal, Store, User } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { cn } from "@/lib/utils";
import { getLeaderboardData, MONTH_COLORS, getMonthFromKey, getShortLabel } from "@/lib/leaderboard";
import LeaderboardFilter from "./LeaderboardFilter";
import { PodiumBars, Top5Bars } from "./LeaderboardBars";
import { StoreLeaderboard } from "./StoreLeaderboard";

export const metadata = { title: "Leaderboard — HNS IT Center" };

export default async function TechnicianLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tab?: string }>;
}) {
  await requireRole("Technician", "Administrator");
  await requirePage("page_leaderboard");
  const params = await searchParams;

  const now = new Date();
  const monthParam = params.month;
  const year  = parseInt(params.year  || String(now.getFullYear()));
  const month = monthParam === "all" ? null : parseInt(monthParam || String(now.getMonth() + 1));
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


  const buildTabHref = (nextTab: string) => {
    const qs = new URLSearchParams();
    if (monthParam) qs.set("month", monthParam);
    if (params.year) qs.set("year", params.year);
    qs.set("tab", nextTab);
    return `/technician/leaderboard?${qs.toString()}`;
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const tabs = [
    { key: "technician", label: "Technicians", href: buildTabHref("technician"), icon: <User aria-hidden="true" /> },
    { key: "store", label: "Store Standings", href: buildTabHref("store"), icon: <Store aria-hidden="true" /> },
  ];

  return (
    // Built from components/app and shadcn, so the page opts into Tailwind
    // spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="technician-leaderboard" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Trophy aria-hidden="true" className="size-6 text-amber-500" />
            Leaderboard Standings
          </span>
        }
        description={`Live standings for ${month ? MONTHS[month - 1] : "All months"} ${year} · Auto-updates on ticket completion`}
        actions={
          <LeaderboardFilter
            defaultMonth={monthParam || String(now.getMonth() + 1)}
            defaultYear={String(year)}
            currentTab={tab}
          />
        }
      />

      <FilterChips label="Standings" chips={tabs} active={isStoreTab ? "store" : "technician"} />

      {noData ? (
        <EmptyState
          key={`${month}-${year}-${tab}`}
          icon={Trophy}
          title={`No completed tickets for ${month ? MONTHS[month - 1] : "this year"} ${year}.`}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300"
        />
      ) : (
        <div key={`${month}-${year}-${tab}`} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {isStoreTab ? (
            <StoreLeaderboard rankedStores={rankedStores} maxPts={rankedStores[0]?.points || 1} />
          ) : (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
              {/* Main Visual Panels */}
              <div className="flex min-w-0 flex-col gap-4">
                {/* Podium */}
                <div className="overflow-hidden rounded-xl bg-[linear-gradient(135deg,#1e3a5f_0%,#16469d_60%,#2557bb_100%)] shadow-sm">
                  <div className="flex items-center gap-2 px-6 pt-4">
                    <Trophy aria-hidden="true" className="size-[18px] text-amber-500" />
                    <span className="text-[0.9375rem] font-bold text-white/90">Top Performers</span>
                  </div>
                  <PodiumBars first={first} second={second} third={third} />
                  <div className="h-2 border-t border-white/20 bg-white/10" />
                </div>

                {/* Progress Bars */}
                {top5.length > 0 && (
                  <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                      Top 5 — Points Breakdown
                    </h3>
                    <Top5Bars top5={top5} maxPts={maxPts} />
                  </section>
                )}
              </div>

              {/* Side List — All Rankings */}
              <section className="flex min-w-0 flex-col gap-2">
                <h3 className="border-b border-border py-3 text-sm font-bold tracking-wide text-muted-foreground uppercase">
                  All Rankings
                </h3>
                <ol className="flex max-h-[400px] flex-col gap-2 overflow-y-auto xl:max-h-[520px]">
                  {rankedTechs.map((t, i) => {
                    const rank       = i + 1;
                    const isTop3     = rank <= 3;
                    const medalColor = rank===1?"#f59e0b":rank===2?"#9ca3af":rank===3?"#b45309":"var(--text-muted)";

                    // Title badge
                    const titleBadge = t.activeTitleLabel && t.activeTitleEmoji && t.activeTitle ? (() => {
                      const mo = getMonthFromKey(t.activeTitle);
                      const mc = MONTH_COLORS[mo] ?? MONTH_COLORS[1];
                      return { label: getShortLabel(t.activeTitleLabel, t.activeTitleEmoji), bg: mc.bg, text: mc.text };
                    })() : null;

                    return (
                      <li
                        key={t.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-3 animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both",
                          isTop3 ? "border-primary/20 bg-secondary" : "border-border bg-card",
                        )}
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
                          style={isTop3 ? { background: `${medalColor}20` } : undefined}
                        >
                          {rank <= 3 ? (
                            <Medal aria-label={`Rank ${rank}`} className="size-3.5" style={{ color: medalColor }} />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">{rank}</span>
                          )}
                        </div>

                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
                          {getInitials(t.name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{t.name}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Lvl {t.level} • {t.tickets} ticket{t.tickets!==1?"s":""}</span>
                            {/* Title badge */}
                            {titleBadge && (
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-wide whitespace-nowrap"
                                style={{ background: titleBadge.bg, color: titleBadge.text }}
                              >
                                {titleBadge.label}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="shrink-0 text-[0.9375rem] font-extrabold" style={{ color: isTop3 ? medalColor : "var(--primary)" }}>
                          {t.points}<span className="ml-0.5 text-[0.7rem] font-medium text-muted-foreground">pts</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
