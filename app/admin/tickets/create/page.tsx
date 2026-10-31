import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "@/app/technician/tickets/create/CreateTicketForm";
import { PageHeader } from "@/components/app/PageHeader";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";

export const metadata = { title: "Create Ticket — HNS IT Center" };

export default async function AdminCreateTicketPage() {
  await requireRole("Administrator", "Sales", "Technician");

  const storeLocations = await db.storeLocation.findMany({ where: { is_active: true } });
  const technicians = await db.user.findMany({ where: { role: "Technician" }, select: { id: true, name: true, store_assignments: { select: { store_id: true } } } });
  const sales = await db.user.findMany({ where: { role: "Sales" }, select: { id: true, name: true } });
  const upgrades = await db.upgrade.findMany();

  return (
    <div data-slot="create-ticket-page" className="flex flex-col gap-6">
      <PageHeader title="Create New Ticket" description="Create a service ticket on behalf of a customer." />

      <CreateTicketForm 
        storeLocations={storeLocations}
        technicians={technicians}
        sales={sales}
        upgrades={upgrades}
        catalogEnabled={isCatalogConfigured()}
      />
    </div>
  );
}
