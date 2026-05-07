import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "./TicketChat";
import { markMessagesReadAction } from "@/app/actions/tickets";
import { FileText, Film, ImageIcon, File } from "lucide-react";

export const metadata = { title: "Ticket Detail — HNS IT Center" };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Customer", "Sales");
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      technician: { select: { name: true } },
      sales: { select: { name: true } },
      attachments: true,
      messages: {
        orderBy: { created_at: "asc" },
        include: { sender: { select: { name: true, role: true } } },
      },
      status_logs: {
        orderBy: { created_at: "desc" },
        take: 5,
        include: { changer: { select: { name: true } } },
      },
      warranty_detail: true,
      cleaning_detail: true,
      upgrade_details: { include: { upgrade: true } },
      pc_components: true,
    },
  });

  if (!ticket || ticket.user_id !== session.userId) notFound();

  // Mark messages as read
  await markMessagesReadAction(id);

  const DETAIL_LABELS: Record<string, string> = {
    service: "Service Request",
    warranty_claim: "Warranty Claim",
    pc_build: "PC Build",
    cleaning: "Cleaning Service",
    upgrade: "Hardware Upgrade",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.25rem" }}>{DETAIL_LABELS[ticket.ticket_type]}</h1>
            <Badge variant={ticket.status} technicianId={ticket.technician_id} />
          </div>
          <p style={{ color: "var(--text-muted)", fontFamily: "monospace", marginTop: "0.25rem" }}>
            {ticket.ticket_code}
          </p>
        </div>
      </div>

      <div className="ticket-detail-grid">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Ticket Info */}
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Ticket Information</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {[
                { label: "Category", value: DETAIL_LABELS[ticket.ticket_type] },
                { label: "Device", value: ticket.device_type.replace(/_/g, " ") },
                { label: "Technician", value: ticket.technician?.name ?? "Not assigned" },
                { label: "Recipient", value: ticket.is_for_self ? session.name : ticket.customer_name },
                { label: "Created", value: new Date(ticket.created_at).toLocaleString("id-ID") },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>{label}</p>
                  <p style={{ fontWeight: 500 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Category-specific details */}
            {ticket.warranty_detail && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Purchase Date</p>
                <p style={{ fontWeight: 500 }}>
                  {new Date(ticket.warranty_detail.purchase_date).toLocaleDateString("id-ID")}
                </p>
              </div>
            )}
            {ticket.cleaning_detail && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Service Package</p>
                <p style={{ fontWeight: 500 }}>{ticket.cleaning_detail.service_package.replace("_", " ")}</p>
              </div>
            )}
            {ticket.upgrade_details.length > 0 && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Upgrades</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {ticket.upgrade_details.map((u) => (
                    <span key={u.id} className="badge" style={{ background: "var(--cream-dark)", color: "var(--text-primary)" }}>
                      {u.upgrade.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {ticket.pc_components.length > 0 && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-light)" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>PC Components</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {ticket.pc_components.map((c) => (
                    <span key={c.id} className="badge badge-technician">{c.component_name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {ticket.notes && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Notes / Problem Description</h3>
              <div
                className="tiptap-content"
                style={{ minHeight: "unset" }}
                dangerouslySetInnerHTML={{ __html: ticket.notes }}
              />
            </div>
          )}

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Attachments ({ticket.attachments.length})</h3>
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
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.375rem",
                        width: isImage ? "80px" : "100px",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{
                        width: isImage ? "80px" : "100px",
                        height: "80px",
                        borderRadius: "0.5rem",
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                        background: "var(--cream)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
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
              sender: { name: m.sender.name, role: m.sender.role },
              isOwn: m.sender_id === session.userId,
            }))}
            currentUserId={session.userId}
          />
        </div>

        {/* Right column: Status Log */}
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>Status History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {ticket.status_logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  paddingBottom: "0.75rem",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                <div style={{ flexShrink: 0, marginTop: "0.2rem" }}>
                  <Badge variant={log.new_status} technicianId={ticket.technician_id} />
                </div>
                <div>
                  <p style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                    {log.old_status ? `${log.old_status.replace("_", " ")} → ` : ""}
                    {log.new_status.replace("_", " ")}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    by {log.changer.name} •{" "}
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
