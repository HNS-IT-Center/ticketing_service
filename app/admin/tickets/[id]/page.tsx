import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/app/customer/tickets/[id]/TicketChat";
import AdminAssignPanel from "./AdminAssignPanel";
import AdminStatusPanel from "./AdminStatusPanel";
import AdminWorkflowPanel from "./AdminWorkflowPanel";
import PublicChatToggle from "./PublicChatToggle";
import { FileText, Film, File, Link2 } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Ticket Detail — Admin" };

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Administrator", "Sales");
  const { id } = await params;

  const [ticket, technicians, salesUsers] = await Promise.all([
    db.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone_number: true, address: true } },
        technician: { select: { name: true } },
        sales: { select: { name: true } },
        store_location: { select: { name: true, code: true } },
        messages: {
          orderBy: { created_at: "asc" },
          include: { sender: { select: { name: true, role: true } } },
        },
        status_logs: {
          orderBy: { created_at: "desc" },
          take: 20,
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
            <Badge variant={ticket.status} technicianId={ticket.technician_id} />
            {ticket.store_location && (
              <span style={{ fontSize: "0.75rem", background: "#f0f4ff", color: "#4f46e5", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600, fontFamily: "monospace" }}>
                {ticket.store_location.code}
              </span>
            )}
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem", textTransform: "capitalize" }}>
            {ticket.ticket_type.replace(/_/g, " ")} &bull; {ticket.device_type.replace(/_/g, " ")}
          </p>
          {ticket.store_location && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>📍 {ticket.store_location.name}</p>
          )}
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
            Created {formatDateTime(ticket.created_at)}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
          <AdminStatusPanel ticketId={ticket.id} currentStatus={ticket.status} />
          {ticket.public_share_token && (
            <Link
              href={`/ticket/${ticket.public_share_token}`}
              target="_blank"
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", color: "var(--primary)", textDecoration: "none" }}
            >
              <Link2 size={14} /> Public Link
            </Link>
          )}
          <PublicChatToggle ticketId={ticket.id} initialEnabled={ticket.public_chat_enabled} />
        </div>
      </div>

      <div className="ticket-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Customer info */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0 }}>Customer Information</h3>
              {!ticket.is_for_self && (
                <span style={{ fontSize: "0.75rem", background: "var(--cream-dark)", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
                  For Someone Else
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem 1.5rem" }}>
              {[
                ["Name", ticket.is_for_self ? ticket.user.name : ticket.customer_name],
                ["Email", ticket.is_for_self ? ticket.user.email : ticket.customer_email],
                ["Phone", ticket.is_for_self ? ticket.user.phone_number : ticket.customer_phone],
                ["Address", ticket.is_for_self ? ticket.user.address : ticket.customer_address],
              ].map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                    {label} {label === "Name" && !ticket.is_for_self ? "(Recipient)" : label === "Name" ? "" : "(Account)"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <p style={{ fontWeight: 500 }}>{value}</p>
                    {label === "Phone" && value && (
                      <a href={`https://wa.me/${(value as string).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", fontSize: "1rem" }} title="Chat on WhatsApp">
                        📱
                      </a>
                    )}
                    {label === "Email" && value && (
                      <a href={`mailto:${value}`} style={{ textDecoration: "none", fontSize: "1rem" }} title="Send Email">
                        📧
                      </a>
                    )}
                  </div>
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

          {/* Workflow panel — CS handover actions */}
          <AdminWorkflowPanel
            ticketId={ticket.id}
            currentStatus={ticket.status as any}
            pickupMethod={ticket.pickup_method}
            userRole={session.role}
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
                    {u.upgrade.name}
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {ticket.attachments.map((a) => {
                  const filename = a.file_url.split("/").pop()?.split("?")[0] ?? "file";
                  const isImage = a.file_type === "image";
                  const isVideo = a.file_type === "video";
                  const isPdf   = a.file_type === "pdf";
                  return (
                    <a
                      key={a.id}
                      href={a.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={filename}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem", width: isImage ? "80px" : "100px", textDecoration: "none" }}
                    >
                      <div style={{ width: isImage ? "80px" : "100px", height: "80px", borderRadius: "0.5rem", overflow: "hidden", border: "1px solid var(--border)", background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.file_url} alt={filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : isVideo ? (
                          <Film size={28} style={{ color: "var(--primary)" }} />
                        ) : isPdf ? (
                          <FileText size={28} style={{ color: "var(--accent)" }} />
                        ) : (
                          <File size={28} style={{ color: "var(--text-muted)" }} />
                        )}
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", wordBreak: "break-all", maxWidth: "100px", lineHeight: 1.3 }}>
                        {filename.length > 20 ? filename.slice(0, 17) + "..." : filename}
                      </span>
                    </a>
                  );
                })}
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
              sender: { name: m.sender?.name ?? m.sender_name ?? "Anonymous", role: m.sender?.role ?? "Customer" },
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
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Status updated to</span>
                    <Badge variant={log.new_status} technicianId={ticket.technician_id} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {log.changer.name} &bull; {formatDateTime(log.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
