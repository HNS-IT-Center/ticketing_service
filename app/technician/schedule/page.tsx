import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import ScheduleManager from "./ScheduleManager";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadDayOffMembers, scheduleScopeFor, technicianWhere } from "@/lib/day-off-server";
import { DayOffBoard } from "@/components/schedule/DayOffBoard";

export const metadata = { title: "Schedule Manager — HNS IT Center" };

export default async function SchedulePage() {
  const session = await requireRole("Technician");

  // "Kelola jadwal teknisi" in Role & Izin — by default the store coordinators —
  // over the stores this technician works in.
  const scope = await scheduleScopeFor(session);

  if (!scope) {
    return (
      <div data-slot="schedule-denied" className="mx-auto flex w-full max-w-md flex-col pt-[10vh]">
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle className="text-base">Access Denied</AlertTitle>
          <AlertDescription>Halaman ini untuk yang punya izin Kelola jadwal teknisi (bawaannya Koordinator Toko).</AlertDescription>
        </Alert>
      </div>
    );
  }

  const [members, technicians] = await Promise.all([
    loadDayOffMembers(scope.storeIds),
    db.user.findMany({
      where: technicianWhere(scope.storeIds),
      include: {
        leaves: { where: { date: { gte: new Date() } } }, // Only future leaves
        overridden_shifts: { where: { date: { gte: new Date() } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div data-slot="schedule-page" className="flex flex-col gap-6">
      <PageHeader
        title="Team Schedule Manager"
        description="Libur tetap dan pengganti, cuti, dan tukar shift untuk tim di toko kamu."
      />
      <DayOffBoard members={members} canEdit />
      <ScheduleManager technicians={technicians} />
    </div>
  );
}
