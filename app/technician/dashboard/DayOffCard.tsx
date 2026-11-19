import { CalendarOff, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { coveringOn, daysOffOf, listDays, readWorkDays, weekdayOf } from "@/lib/day-off";
import { loadCoverRules } from "@/lib/day-off-server";
import { wibDayKey } from "@/lib/store-dashboard";

/**
 * The technician's own libur tetap, and whom they cover today. Worked out on
 * read, so the replacement sees it the moment the day starts — the app has no
 * scheduled job to send a morning notice. Renders nothing when there is
 * nothing to say.
 */
export default async function DayOffCard({ userId }: { userId: string }) {
  // eslint-disable-next-line react-hooks/purity -- server component, read once
  const today = wibDayKey(Date.now());
  const [me, rules] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { work_days: true, day_off_rule: { select: { replacement: { select: { name: true, is_active: true } } } } },
    }),
    loadCoverRules([userId]),
  ]);
  const daysOff = daysOffOf(readWorkDays(me?.work_days));
  const covering = coveringOn(userId, today, rules).map((r) => r.technicianName);
  if (!daysOff && covering.length === 0) return null;
  const replacement = me?.day_off_rule?.replacement?.is_active ? me.day_off_rule.replacement.name : null;
  const offToday = daysOff?.includes(weekdayOf(today)) ?? false;

  return (
    <section aria-label="Jadwal libur" className="flex flex-col gap-2">
      {covering.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-tone-green-border bg-tone-green-bg px-4 py-3 text-sm font-semibold text-tone-green-fg">
          <UserCheck aria-hidden className="size-4 shrink-0" /> Hari ini kamu menggantikan {listNames(covering)} (libur).
        </p>
      )}
      {daysOff && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-tone-blue-border bg-tone-blue-bg px-4 py-3 text-sm text-tone-blue-fg">
          <CalendarOff aria-hidden className="size-4 shrink-0" />
          <span>
            Libur tetap: setiap <strong>{listDays(daysOff)}</strong>
            {replacement ? `, digantikan ${replacement}` : ", tanpa pengganti tetap"}.
            {offToday && " Hari ini jadwal liburmu."}
          </span>
        </p>
      )}
    </section>
  );
}

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
