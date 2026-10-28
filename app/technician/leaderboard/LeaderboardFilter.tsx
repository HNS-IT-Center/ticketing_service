"use client";

import { useRouter } from "next/navigation";

export default function LeaderboardFilter({ 
  defaultMonth, 
  defaultYear, 
  currentTab 
}: { 
  defaultMonth: string, 
  defaultYear: string, 
  currentTab: string 
}) {
  const router = useRouter();
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const form = e.target.form;
    if (!form) return;
    const formData = new FormData(form);
    const m = formData.get("month") as string;
    const y = formData.get("year") as string;
    
    const qs = new URLSearchParams();
    if (m) qs.set("month", m);
    if (y) qs.set("year", y);
    if (currentTab) qs.set("tab", currentTab);
    
    router.push(`?${qs.toString()}`);
  };

  // Native selects on purpose: on an Android phone they open the system
  // picker, which is the quickest way to choose a month.
  const selectClass =
    "h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9";

  return (
    <form data-slot="leaderboard-filter" className="flex flex-wrap items-center gap-2 *:flex-1 sm:*:flex-none">
      <input type="hidden" name="tab" value={currentTab} />
      <label className="sr-only" htmlFor="leaderboard-month">Month</label>
      <select id="leaderboard-month" name="month" defaultValue={defaultMonth} className={selectClass} onChange={handleChange}>
        <option value="all">All months</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="leaderboard-year">Year</label>
      <select id="leaderboard-year" name="year" defaultValue={defaultYear} className={selectClass} onChange={handleChange}>
        {[2024, 2025, 2026, 2027].map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </form>
  );
}
