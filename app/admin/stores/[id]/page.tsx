import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import StoreEditForm from "./StoreEditForm";
import SupervisorAssignments from "./SupervisorAssignments";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await db.storeLocation.findUnique({ where: { id }, select: { name: true } });
  return { title: `${store?.name ?? "Store"} — HNS IT Center` };
}

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("Administrator", "Sales");

  const [store, allTechnicians, supervisors, allSupervisors] = await Promise.all([
    db.storeLocation.findUnique({
      where: { id },
      include: {
        technician_stores: {
          include: { technician: { select: { id: true, name: true, shift: true, is_team_leader: true } } },
          orderBy: { assigned_at: "asc" },
        },
        _count: { select: { tickets: true } },
      },
    }),
    db.user.findMany({
      where: { role: "Technician" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.storeSupervisorAssignment.findMany({
      where: { store_id: id },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { assigned_at: "asc" },
    }),
    db.user.findMany({
      where: { role: "StoreSupervisor", is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!store) notFound();

  return (
    <StoreEditForm store={store} allTechnicians={allTechnicians}>
      <SupervisorAssignments
        storeId={store.id}
        assigned={supervisors.map((s) => s.user)}
        candidates={allSupervisors}
      />
    </StoreEditForm>
  );
}
