import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import ScheduleManager from "./ScheduleManager";

export const metadata = { title: "Schedule Manager — HNS IT Center" };

export default async function SchedulePage() {
  const session = await requireRole("Technician");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    include: { store_assignments: true }
  });

  if (!me?.is_team_leader) {
    return (
      <div className="container" style={{ padding: "2rem 0", textAlign: "center", marginTop: "10vh" }}>
        <h2 style={{ fontSize: "1.5rem", color: "var(--accent)", marginBottom: "1rem" }}>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>This page is restricted to Store Coordinators.</p>
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
    <div className="container" style={{ padding: "2rem 0" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Team Schedule Manager</h1>
        <p className="page-description">Manage shifts, override schedules, and assign leaves for your team.</p>
      </div>
      
      <ScheduleManager technicians={technicians} />
    </div>
  );
}
