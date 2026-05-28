import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "./CreateTicketForm";

export const metadata = { title: "Create Ticket — HNS IT Center" };

export default async function TechnicianCreateTicketPage() {
  const session = await requireRole("Technician", "Sales", "Administrator");

  const storeLocations = await db.storeLocation.findMany({ where: { is_active: true } });
  const technicians = await db.user.findMany({ 
    where: { role: "Technician" }, 
    select: { id: true, name: true, store_assignments: { select: { store_id: true } } } 
  });
  const sales = await db.user.findMany({ where: { role: "Sales" }, select: { id: true, name: true } });
  const upgrades = await db.upgrade.findMany();
  
  // Find current user's default store (first assigned store, if any)
  const currentUserStores = await db.technicianStoreAssignment.findMany({
    where: { technician_id: session.userId },
    select: { store_id: true }
  });
  const defaultStoreLocationId = currentUserStores[0]?.store_id || "";

  return (
    <div className="container" style={{ padding: "2rem 0" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Create New Ticket</h1>
        <p className="page-description">Create a service ticket on behalf of a customer.</p>
      </div>

      <CreateTicketForm 
        storeLocations={storeLocations}
        technicians={technicians}
        sales={sales}
        upgrades={upgrades}
        defaultStoreLocationId={defaultStoreLocationId}
      />
    </div>
  );
}
