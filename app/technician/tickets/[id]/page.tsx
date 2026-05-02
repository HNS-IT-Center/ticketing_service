import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/app/customer/tickets/[id]/TicketChat";
import StatusUpdater from "./StatusUpdater";
import { markMessagesReadAction } from "@/app/actions/tickets";

export const metadata = { title: "Ticket Detail — TechServe" };

export default async function TechnicianTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Technician");
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone_number: true } },
      technician: { select: { name: true } },
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
    },
  });

  if (!ticket) notFound();

  // Mark messages read
  await markMessagesReadAction(id);

  const isAssigned = ticket.technician_id === session.userId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.25rem" }}>{ticket.ticket_code}</h1>
            <Badge variant={ticket.status} />
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem", textTransform: "capitalize" }}>
            {ticket.ticket_type.replace("_", " ")} • {ticket.device_type.replace(/_/g, " ")}
          </p>
        </div>
        {isAssigned && (
          <StatusUpdater ticketId={ticket.id} currentStatus={ticket.status} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Customer Info */}
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Customer Information</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {[
                ["Name", ticket.user.name],
                ["Email", ticket.user.email],
                ["Phone", ticket.user.phone_number],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", gap: "1rem" }}>
                  <span style={{ width: "60px", flexShrink: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {ticket.notes && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Problem Description</h3>
              <div className="tiptap-content" style={{ minHeight: "unset" }} dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </div>
          )}

          {/* PC Components */}
          {ticket.pc_components.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>PC Components</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {ticket.pc_components.map((c) => (
                  <span key={c.id} className="badge badge-technician">{c.component_name}</span>
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
              isOwn: m.sender_id === session.userId,
            }))}
            currentUserId={session.userId}
          />
        </div>

        {/* Status log */}
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Status History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {ticket.status_logs.map((log) => (
              <div key={log.id} style={{ paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-light)" }}>
                <Badge variant={log.new_status} />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                  {log.changer.name} • {new Date(log.created_at).toLocaleString("id-ID")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
