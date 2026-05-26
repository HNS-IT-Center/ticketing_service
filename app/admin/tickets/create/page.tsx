import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "@/app/technician/tickets/create/CreateTicketForm";

export const metadata = { title: "Create Ticket — HNS IT Center" };

export default async function AdminCreateTicketPage() {
  await requireRole("Administrator", "Sales", "Technician");

  const storeLocations = await db.storeLocation.findMany({ where: { is_active: true } });
  const technicians = await db.user.findMany({ where: { role: "Technician" }, select: { id: true, name: true } });
  const sales = await db.user.findMany({ where: { role: "Sales" }, select: { id: true, name: true } });
  const upgrades = await db.upgrade.findMany();

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
      />
    </div>
  );
}
