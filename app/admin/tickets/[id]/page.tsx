import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/app/customer/tickets/[id]/TicketChat";
import AdminAssignPanel from "./AdminAssignPanel";
import AdminStatusPanel from "./AdminStatusPanel";

export const metadata = { title: "Ticket Detail — Admin" };

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("Administrator");
  const { id } = await params;

  const [ticket, technicians, salesUsers] = await Promise.all([
    db.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone_number: true, address: true } },
        technician: { select: { name: true } },
        sales: { select: { name: true } },
        messages: {
          orderBy: { created_at: "asc" },
          include: { sender: { select: { name: true, role: true } } },
        },
        status_logs: {
          orderBy: { created_at: "desc" },
          include: { changer: { select: { name: true } } },
        },
        warranty_detail: true,
        cleaning_detail: true,
        upgrade_details: { include: { upgrade: true } },
        pc_components: true,
        attachments: true,
      },
    }),
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
  ]);

  if (!ticket) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.25rem" }}>{ticket.ticket_code}</h1>
            <Badge variant={ticket.status} />
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem", textTransform: "capitalize" }}>
            {ticket.ticket_type.replace(/_/g, " ")} &bull; {ticket.device_type.replace(/_/g, " ")}
          </p>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
            Created {new Date(ticket.created_at).toLocaleString("id-ID")}
          </p>
        </div>
        <AdminStatusPanel ticketId={ticket.id} currentStatus={ticket.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Customer info */}
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Customer Information</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem 1.5rem" }}>
              {[
                ["Name", ticket.user.name],
                ["Email", ticket.user.email],
                ["Phone", ticket.user.phone_number],
                ["Address", ticket.user.address],
              ].map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>{label}</p>
                  <p style={{ fontWeight: 500 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Assignment panel */}
          <AdminAssignPanel
            ticketId={ticket.id}
            currentTechnicianId={ticket.technician_id}
            currentSalesId={ticket.sales_id}
            technicians={technicians}
            salesUsers={salesUsers}
          />

          {/* Notes */}
          {ticket.notes && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Problem Description</h3>
              <div className="tiptap-content" dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </div>
          )}

          {/* Warranty detail */}
          {ticket.warranty_detail && (
            <div className="card">
              <h3 style={{ marginBottom: "0.5rem" }}>Warranty Information</h3>
              <p style={{ color: "var(--text-muted)" }}>
                Purchase Date: <strong>{new Date(ticket.warranty_detail.purchase_date).toLocaleDateString("id-ID")}</strong>
              </p>
            </div>
          )}

          {/* Cleaning detail */}
          {ticket.cleaning_detail && (
            <div className="card">
              <h3 style={{ marginBottom: "0.5rem" }}>Cleaning Service</h3>
              <span className="badge badge-technician">{ticket.cleaning_detail.service_package.replace("_", " ")}</span>
            </div>
          )}

          {/* Upgrade details */}
          {ticket.upgrade_details.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "0.75rem" }}>Upgrade Items</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {ticket.upgrade_details.map((u) => (
                  <span key={u.id} className="badge badge-technician">
                    {u.upgrade.name} ({u.upgrade.points} pts)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* PC Components */}
          {ticket.pc_components.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "0.75rem" }}>PC Build Components</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {ticket.pc_components.map((c) => (
                  <span key={c.id} className="badge badge-technician">{c.component_name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "0.75rem" }}>Attachments ({ticket.attachments.length})</h3>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {ticket.attachments.map((a) => (
                  <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "0.5rem 1rem", background: "var(--cream)", borderRadius: "var(--radius-md)", fontSize: "0.875rem", fontWeight: 500, color: "var(--primary)" }}>
                    {a.file_type} file ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Chat */}
          <TicketChat
            ticketId={ticket.id}
            messages={ticket.messages.map((m) => ({
              id: m.id,
              message: m.message,
              created_at: m.created_at.toISOString(),
              is_read: m.is_read,
              sender: { name: m.sender.name, role: m.sender.role },
              isOwn: false,
            }))}
            currentUserId="admin"
          />
        </div>

        {/* Sidebar: Status log */}
        <div className="card" style={{ alignSelf: "flex-start" }}>
          <h3 style={{ marginBottom: "1rem" }}>Status History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {ticket.status_logs.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No status changes yet</p>
            ) : (
              ticket.status_logs.map((log) => (
                <div key={log.id} style={{ paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
                    {log.old_status && <><Badge variant={log.old_status} /><span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>→</span></>}
                    <Badge variant={log.new_status} />
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                    {log.changer.name} &bull; {new Date(log.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
