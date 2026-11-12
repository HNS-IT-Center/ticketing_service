import { requirePage } from "@/lib/page-access";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "@/app/technician/tickets/create/CreateTicketForm";
import { PageHeader } from "@/components/app/PageHeader";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";

export const metadata = { title: "Create Ticket — HNS IT Center" };

export default async function SalesCreateTicketPage() {
  const session = await requireRole("Sales", "Administrator");
  await requirePage("page_create_ticket");

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
    <div data-slot="create-ticket-page" className="flex flex-col gap-6">
      <PageHeader
        title="Create New Ticket"
        description="Create a service ticket on behalf of a customer."
      />

      <CreateTicketForm 
        storeLocations={storeLocations}
        technicians={technicians}
        sales={sales}
        upgrades={upgrades}
        catalogEnabled={isCatalogConfigured()}
        defaultStoreLocationId={defaultStoreLocationId}
      />
    </div>
  );
}
