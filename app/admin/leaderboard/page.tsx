import { requirePage } from "@/lib/page-access";
// Admin leaderboard — live design with Technician and Store (Team vs Team) standings
import { Trophy, Crown, Medal, Store, Users, User } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { getLeaderboardData, MONTH_COLORS, getMonthFromKey, getShortLabel } from "@/lib/leaderboard";
// Same podium and bars as the technician leaderboard; the admin page drew a
// copy of them by hand.
import { PodiumBars, Top5Bars } from "@/app/technician/leaderboard/LeaderboardBars";

export const metadata = { title: "Leaderboard — Admin — HNS IT Center" };

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tab?: string }>;
}) {
  await requirePage("page_leaderboard");
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

  const buildTabHref = (nextTab: string) => {
    const qs = new URLSearchParams();
    if (monthParam) qs.set("month", monthParam);
    if (params.year) qs.set("year", params.year);
    qs.set("tab", nextTab);
    return `/admin/leaderboard?${qs.toString()}`;
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const tabs = [
    { key: "technician", label: "Technicians", href: buildTabHref("technician"), icon: <User aria-hidden="true" /> },
    { key: "store", label: "Store Standings", href: buildTabHref("store"), icon: <Store aria-hidden="true" /> },
  ];

  // Gold, silver, bronze — the same three as the podium.
  const STORE_RANK = [
    { ring: "border-amber-500", tag: "bg-amber-500", label: "1st Place" },
    { ring: "border-gray-400", tag: "bg-gray-400", label: "2nd Place" },
    { ring: "border-amber-700", tag: "bg-amber-700", label: "3rd Place" },
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-leaderboard" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Trophy aria-hidden="true" className="size-6 text-amber-500" />
            Leaderboard Standings
          </span>
        }
        description={`Live standings for ${month ? MONTHS[month - 1] : "All months"} ${year} · Auto-updates on ticket completion`}
        actions={
          <form className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {tab && <input type="hidden" name="tab" value={tab} />}
            <label htmlFor="leaderboard-month" className="sr-only">Month</label>
            <NativeSelect id="leaderboard-month" name="month" defaultValue={month ?? "all"} className="sm:w-36">
              <option value="all">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </NativeSelect>
            <label htmlFor="leaderboard-year" className="sr-only">Year</label>
            <NativeSelect id="leaderboard-year" name="year" defaultValue={year} className="sm:w-28">
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </NativeSelect>
            <Button type="submit" className="col-span-2">Filter</Button>
          </form>
        }
      />

      <FilterChips label="Standings" chips={tabs} active={isStoreTab ? "store" : "technician"} />

      {noData ? (
        <EmptyState icon={Trophy} title={`No completed tickets for ${month ? MONTHS[month - 1] : "this year"} ${year}.`} />
      ) : isStoreTab ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="flex items-center justify-center gap-2 text-xl font-black tracking-wider text-foreground uppercase md:text-2xl">
              <span aria-hidden="true">⚔️</span> Team vs Team Showdown <span aria-hidden="true">⚔️</span>
            </h2>
            <p className="text-muted-foreground">Which store will dominate the leaderboard?</p>
          </div>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {rankedStores.map((store, i) => {
              const place = store.points > 0 ? STORE_RANK[i] : undefined;
              const isFirst = i === 0 && store.points > 0;
              return (
                <li
                  key={store.id}
                  className={cn(
                    "relative flex flex-col items-center overflow-hidden rounded-xl border-2 bg-card p-6 shadow-sm",
                    place ? place.ring : "border-border",
                    isFirst && "bg-[linear-gradient(135deg,rgba(245,158,11,0.1)_0%,rgba(245,158,11,0.02)_100%)]",
                  )}
                >
                  {place && (
                    <div className={cn("absolute top-0 right-0 flex items-center gap-1 rounded-bl-lg px-3 py-1 text-xs font-bold text-white shadow", place.tag)}>
                      {isFirst && <Crown aria-hidden="true" className="size-3" />} {place.label}
                    </div>
                  )}
                  <div
                    className={cn(
                      "mb-3 flex size-20 items-center justify-center rounded-full border-4 bg-primary text-2xl font-black text-primary-foreground shadow-lg",
                      isFirst ? "border-amber-500" : "border-white",
                    )}
                  >
                    {store.code}
                  </div>
                  <h3 className="mb-1 text-center text-xl font-bold text-foreground">{store.name}</h3>
                  <div className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 text-sm text-muted-foreground">
                    <Users aria-hidden="true" className="size-3.5" /> {store.techCount} Technicians
                  </div>
                  <div className={cn("w-full rounded-xl border bg-card p-4 text-center shadow-sm", isFirst ? "border-amber-500/30" : "border-border")}>
                    <div className={cn("mb-1 text-4xl font-extrabold", isFirst ? "text-amber-500" : "text-primary")}>
                      {store.points} <span className="ml-1 text-sm font-bold tracking-widest text-muted-foreground uppercase">Pts</span>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">{store.tickets} tickets completed</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
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
                      {isTop3 ? (
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
                        <span>{t.tickets} ticket{t.tickets!==1?"s":""}</span>
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
  );
}
