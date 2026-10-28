import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import ScheduleManager from "./ScheduleManager";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata = { title: "Schedule Manager — HNS IT Center" };

export default async function SchedulePage() {
  const session = await requireRole("Technician");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    include: { store_assignments: true }
  });

  if (!me?.is_team_leader) {
    return (
      <div data-slot="schedule-denied" className="mx-auto flex w-full max-w-md flex-col pt-[10vh]">
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle className="text-base">Access Denied</AlertTitle>
          <AlertDescription>This page is restricted to Store Coordinators.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const storeIds = me.store_assignments.map(s => s.store_id);
  
  const technicians = await db.user.findMany({
    where: {
      role: "Technician",
      store_assignments: {
        some: { store_id: { in: storeIds } }
      }
    },
    include: {
      leaves: {
        where: { date: { gte: new Date() } } // Only future leaves
      },
      overridden_shifts: {
        where: { date: { gte: new Date() } }
      }
    }
  });

  return (
    <div data-slot="schedule-page" className="flex flex-col gap-6">
      <PageHeader
        title="Team Schedule Manager"
        description="Manage shifts, override schedules, and assign leaves for your team."
      />
      <ScheduleManager technicians={technicians} />
    </div>
  );
}
