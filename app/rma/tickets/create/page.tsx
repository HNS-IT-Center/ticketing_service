import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "@/app/technician/tickets/create/CreateTicketForm";
import { PageHeader } from "@/components/app/PageHeader";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";

export const metadata = { title: "Create Ticket — HNS IT Center" };

/**
 * The RMA desk can raise a ticket too — useful when a claim walks in and every
 * technician is busy, so intake is not blocked.
 *
 * Reuses the same form as the technician, sales and admin portals;
 * createTicketAction only requires a session, so no server change was needed.
 *
 * Route note: this static `create` segment takes precedence over the sibling
 * `[ticketId]` resolver, so /rma/tickets/create lands here.
 */
export default async function RmaCreateTicketPage() {
  await requireRole("RMA", "Administrator");

  const [storeLocations, technicians, sales, upgrades] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true } }),
    db.user.findMany({
      where: { role: "Technician" },
      select: { id: true, name: true, store_assignments: { select: { store_id: true } } },
    }),
    db.user.findMany({ where: { role: "Sales" }, select: { id: true, name: true } }),
    db.upgrade.findMany(),
  ]);

  return (
    // The form below is still legacy markup, so the root keeps no data-slot
    // (the UI-1 rule); PageHeader brings its own.
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Create New Ticket"
        description="Buat tiket atas nama customer. Kosongkan teknisi bila belum ada yang tersedia — tiket akan masuk antrean dan bisa diambil teknisi mana pun."
      />

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
