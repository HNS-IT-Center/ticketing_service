import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { Ticket, PlusCircle, Activity } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Sales Dashboard — HNS IT Center" };

export default async function SalesDashboardPage() {
  const session = await requireRole("Sales", "Administrator");

  const [activeTickets, totalTickets] = await Promise.all([
    db.ticket.count({
      where: {
        sales_id: session.userId,
        status: { in: ["waiting", "on_progress", "ready_for_pickup", "waiting_pickup"] }
      }
    }),
    db.ticket.count({
      where: { sales_id: session.userId }
    })
  ]);

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="sales-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title="Sales Dashboard"
        description={`Welcome back, ${session.name}. Here is a summary of your tickets.`}
      />

      <div className="grid grid-cols-2 gap-3 md:max-w-xl">
        <StatCard icon={Activity} value={activeTickets} label="Active Tickets" href="/sales/tickets" />
        <StatCard icon={Ticket} value={totalTickets} label="Total Created" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/sales/tickets/create" className={buttonVariants()}>
          <PlusCircle aria-hidden="true" /> Create New Ticket
        </Link>
        <Link href="/sales/tickets" className={buttonVariants({ variant: "outline", className: "bg-card" })}>
          <Ticket aria-hidden="true" /> View My Tickets
        </Link>
      </div>
    </div>
  );
}
