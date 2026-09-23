import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import CreateTicketForm from "@/app/technician/tickets/create/CreateTicketForm";

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
    <div className="container" style={{ padding: "2rem 0" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Create New Ticket</h1>
        <p className="page-description">
          Buat tiket atas nama customer. Kosongkan teknisi bila belum ada yang tersedia —
          tiket akan masuk antrean dan bisa diambil teknisi mana pun.
        </p>
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
