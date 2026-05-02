import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket } from "lucide-react";

export const metadata = { title: "My Tickets — TechServe" };

const STATUS_FILTERS = ["all", "waiting", "on_progress", "done", "cancelled"] as const;

export default async function TechnicianTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole("Technician");
  const params = await searchParams;
  const statusFilter = params.status || "all";

  const tickets = await db.ticket.findMany({
    where: {
      technician_id: session.userId,
      ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    },
    orderBy: { updated_at: "desc" },
    include: { user: { select: { name: true } } },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h1>My Tickets</h1>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/technician/tickets" : `/technician/tickets?status=${s}`}
            className="btn btn-sm"
            style={{
              background: statusFilter === s ? "var(--primary)" : "var(--white)",
              color: statusFilter === s ? "var(--white)" : "var(--text-secondary)",
              border: "1.5px solid",
              borderColor: statusFilter === s ? "var(--primary)" : "var(--border)",
              textTransform: "capitalize",
            }}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="table-wrapper">
        {tickets.length === 0 ? (
          <div className="empty-state">
            <Ticket size={36} style={{ opacity: 0.3 }} />
            <p>No tickets found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticket Code</th><th>Type</th><th>Customer</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                  <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                  <td>{t.user.name}</td>
                  <td><Badge variant={t.status} /></td>
                  <td style={{ color: "var(--text-muted)" }}>{new Date(t.updated_at).toLocaleDateString("id-ID")}</td>
                  <td><Link href={`/technician/tickets/${t.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
