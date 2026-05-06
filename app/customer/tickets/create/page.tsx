import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import CreateTicketForm from "./CreateTicketForm";

export const metadata = { title: "Create Ticket — HNS IT Center" };

export default async function CreateTicketPage() {
  const session = await requireRole("Customer", "Sales");

  const [upgrades, technicians, sales, userProfile] = await Promise.all([
    db.upgrade.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { role: "Technician" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: "Sales" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true, phone_number: true, address: true },
    }),
  ]);

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>Create New Ticket</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Fill in the details below to submit a service request
        </p>
      </div>
      <CreateTicketForm
        upgrades={upgrades}
        technicians={technicians}
        sales={sales}
        userProfile={userProfile ?? undefined}
      />
    </div>
  );
}
