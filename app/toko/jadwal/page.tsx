import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { pickStores, requireStoreViewer } from "@/lib/store-scope-server";
import { dayHeading, resolveWeek, scheduleCell, shiftDays, shiftLabel, type ScheduleCell } from "@/lib/store-schedule";
import { dayLabel, wibDayKey } from "@/lib/store-dashboard";
import { NoStores } from "@/components/toko/Sections";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterBarField } from "@/components/app/FilterBar";
import { cn } from "@/lib/utils";

export const metadata = { title: "Jadwal Teknisi — HNS IT Center" };

type Search = { week?: string; store?: string };

const CELL_STYLE: Record<ScheduleCell["kind"], string> = {
  shift: "border-tone-green-border bg-tone-green-bg text-tone-green-fg",
  covering: "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg",
  covered: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg",
  leave: "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
  off: "border-border bg-muted text-muted-foreground",
  unset: "border-dashed border-border bg-card text-muted-foreground",
};

function cellText(c: ScheduleCell): { main: string; sub?: string } {
  switch (c.kind) {
    case "shift":
      return { main: shiftLabel(c.shift) };
    case "covering":
      return { main: `${shiftLabel(c.shift)}`, sub: `gantikan ${c.for}` };
    case "covered":
      return { main: "Digantikan", sub: c.by };
    case "leave":
      return { main: "Cuti", sub: c.reason ?? undefined };
    case "off":
      return { main: "Libur" };
    case "unset":
      return { main: "—" };
  }
}

/**
 * The week of the kepala toko's technicians, read only: shift per day, leave,
 * and who covers whom. Leave and swaps are set by the store coordinator in the
 * technician portal; the weekly pattern on the admin's user form.
 */
export default async function StoreSchedulePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { stores } = await requireStoreViewer();
  if (stores.length === 0) return <NoStores title="Jadwal Teknisi" />;
  const params = await searchParams;
  const { chosen, shown, ids } = pickStores(stores, params.store);
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const now = Date.now();
  const today = wibDayKey(now);
  const { monday, days } = resolveWeek(params.week, now);

  const technicians = await db.user.findMany({
    where: { role: "Technician", is_active: true, store_assignments: { some: { store_id: { in: ids } } } },
    select: { id: true, name: true, shift: true, work_days: true },
    orderBy: { name: "asc" },
  });
  const techIds = technicians.map((t) => t.id);
  const range = { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[6]}T00:00:00Z`) };
  const [leaves, overrides] = await Promise.all([
    db.technicianLeave.findMany({ where: { technician_id: { in: techIds }, date: range }, select: { technician_id: true, date: true, reason: true } }),
    db.shiftOverride.findMany({
      where: { date: range, OR: [{ original_tech_id: { in: techIds } }, { override_tech_id: { in: techIds } }] },
      select: {
        original_tech_id: true,
        override_tech_id: true,
        date: true,
        shift: true,
        original_tech: { select: { name: true } },
        override_tech: { select: { name: true } },
      },
    }),
  ]);
  const names = new Map<string, string>();
  for (const t of technicians) names.set(t.id, t.name);
  for (const o of overrides) {
    names.set(o.original_tech_id, o.original_tech.name);
    names.set(o.override_tech_id, o.override_tech.name);
  }
  const leaveRows = leaves.map((l) => ({ technicianId: l.technician_id, day: l.date.toISOString().slice(0, 10), reason: l.reason }));
  const overrideRows = overrides.map((o) => ({
    originalId: o.original_tech_id,
    overrideId: o.override_tech_id,
    day: o.date.toISOString().slice(0, 10),
    shift: o.shift,
  }));
  const rows = technicians.map((t) => ({
    tech: t,
    cells: days.map((d) =>
      scheduleCell(
        { id: t.id, name: t.name, shift: t.shift, workDays: Array.isArray(t.work_days) ? (t.work_days as string[]) : null },
        d,
        leaveRows,
        overrideRows,
        (id) => names.get(id) ?? "teknisi lain",
      ),
    ),
  }));
  const anyUnset = rows.some((r) => r.cells.some((c) => c.kind === "unset"));

  const href = (week: string) => {
    const q = new URLSearchParams({ week });
    if (chosen) q.set("store", chosen.id);
    return `/toko/jadwal?${q}`;
  };

  return (
    <div data-slot="store-schedule" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-6" /> Jadwal Teknisi
          </span>
        }
        description={`${shown.map((s) => s.name).join(", ")} · ${dayLabel(days[0])} – ${dayLabel(days[6])}`}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <nav aria-label="Pilih minggu" className="flex items-center gap-2">
          <Link href={href(shiftDays(monday, -7))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Minggu sebelumnya">
            <ChevronLeft aria-hidden />
          </Link>
          <Link href={href(resolveWeek(undefined, now).monday)} className={buttonVariants({ variant: "outline" })}>
            Minggu ini
          </Link>
          <Link href={href(shiftDays(monday, 7))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Minggu berikutnya">
            <ChevronRight aria-hidden />
          </Link>
        </nav>
        {stores.length > 1 && (
          <FilterBar action="/toko/jadwal">
            <input type="hidden" name="week" value={monday} />
            <FilterBarField label="Toko" htmlFor="tj-store" className="md:w-48">
              <NativeSelect id="tj-store" name="store" defaultValue={chosen?.id ?? ""}>
                <option value="">Semua toko</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FilterBarField>
            <Button type="submit">Tampilkan</Button>
          </FilterBar>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada teknisi di toko ini.</p>
          ) : (
            <table className="w-full min-w-[44rem] border-separate border-spacing-1 text-sm">
              <caption className="sr-only">Jadwal teknisi per hari</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-40 px-2 py-1 text-left text-xs font-medium text-muted-foreground">
                    Teknisi
                  </th>
                  {days.map((d) => {
                    const h = dayHeading(d);
                    return (
                      <th
                        key={d}
                        scope="col"
                        className={cn("px-2 py-1 text-center text-xs font-medium", d === today ? "text-primary" : "text-muted-foreground")}
                      >
                        <span className="block">{h.name}</span>
                        <span className={cn("block", d === today && "font-bold")}>{h.date}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tech.id}>
                    <th scope="row" className="px-2 py-1 text-left font-semibold text-foreground">
                      {r.tech.name}
                    </th>
                    {r.cells.map((c, i) => {
                      const t = cellText(c);
                      return (
                        <td
                          key={days[i]}
                          title={t.sub ? `${t.main} — ${t.sub}` : t.main}
                          className={cn("h-14 rounded-md border px-1.5 py-1 text-center align-middle", CELL_STYLE[c.kind], days[i] === today && "ring-2 ring-primary/40")}
                        >
                          <span className="block text-xs font-semibold">{t.main}</span>
                          {t.sub && <span className="block truncate text-[0.6875rem]">{t.sub}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Keterangan">
        {(
          [
            ["shift", "Masuk (Pagi / Siang)"],
            ["covering", "Menggantikan teknisi lain"],
            ["covered", "Digantikan teknisi lain"],
            ["leave", "Cuti"],
            ["off", "Libur"],
          ] as const
        ).map(([k, label]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-sm border", CELL_STYLE[k])} />
            {label}
          </li>
        ))}
      </ul>
      {anyUnset && (
        <p className="text-sm text-muted-foreground">
          &ldquo;—&rdquo; = hari kerja teknisi ini belum diatur. Admin mengaturnya di Data Master → Users (shift dan hari kerja).
        </p>
      )}
    </div>
  );
}
