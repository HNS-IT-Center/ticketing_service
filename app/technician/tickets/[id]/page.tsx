import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/components/TicketChat";
import StatusUpdater from "./StatusUpdater";
import { markMessagesReadAction } from "@/app/actions/tickets";
import { FileText, Film, ImageIcon, File, Link2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import AdminAssignPanel from "@/app/admin/tickets/[id]/AdminAssignPanel";

export const metadata = { title: "Ticket Detail — HNS IT Center" };

export default async function TechnicianTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Technician");
  const { id } = await params;

  const [ticket, currentUser] = await Promise.all([
    db.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone_number: true, address: true } },
        technician: { select: { name: true } },
        messages: {
          orderBy: { created_at: "asc" },
          include: { sender: { select: { name: true, role: true } } },
        },
        attachments: true,
        status_logs: {
          orderBy: { created_at: "desc" },
          take: 20,
          include: { changer: { select: { name: true } } },
        },
        warranty_detail: true,
        cleaning_detail: true,
        upgrade_details: { include: { upgrade: true } },
        pc_components: true,
        pc_build_detail: true,
        time_logs: { orderBy: { created_at: "asc" } },
        assignment_requests: {
          include: { technician: { select: { name: true } } }
        },
      },
    }),
    db.user.findUnique({ where: { id: session.userId }, select: { is_team_leader: true } })
  ]);

  if (!ticket) notFound();

  // Mark messages read
  await markMessagesReadAction(id);

  const isAssigned = ticket.technician_id === session.userId;
  const isTeamLeader = currentUser?.is_team_leader || false;

  let technicians: { id: string; name: string }[] = [];
  let salesUsers: { id: string; name: string }[] = [];
  
  if (isTeamLeader) {
    const [fetchedTechs, fetchedSales] = await Promise.all([
      db.user.findMany({ where: { role: "Technician" }, select: { id: true, name: true } }),
      db.user.findMany({ where: { role: "Sales" }, select: { id: true, name: true } }),
    ]);
    technicians = fetchedTechs;
    salesUsers = fetchedSales;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.25rem" }}>{ticket.ticket_code}</h1>
            <Badge variant={ticket.status} technicianId={ticket.technician_id} />
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem", textTransform: "capitalize" }}>
            {ticket.ticket_type.replace("_", " ")} • {ticket.device_type.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-col gap-3 items-start md:items-end mt-2 md:mt-0">
          {isAssigned && (
            <StatusUpdater ticketId={ticket.id} currentStatus={ticket.status} timeLogs={ticket.time_logs} />
          )}
          {ticket.public_share_token && (
            <Link
              href={`/ticket/${ticket.public_share_token}`}
              target="_blank"
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100"
            >
              <Link2 size={16} /> Public Link
            </Link>
          )}

          {isTeamLeader && (
            <div style={{ marginTop: "1rem" }}>
              <AdminAssignPanel
                ticketId={ticket.id}
                currentTechnicianId={ticket.technician_id}
                currentSalesId={ticket.sales_id}
                technicians={technicians}
                salesUsers={salesUsers}
                assignmentRequests={ticket.assignment_requests as any}
              />
            </div>
          )}
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
            <div className="flex flex-col gap-4">
              {[
                ["Name", ticket.is_for_self ? ticket.user.name : ticket.customer_name],
                ["Email", ticket.is_for_self ? ticket.user.email : ticket.customer_email],
                ["Phone", ticket.is_for_self ? ticket.user.phone_number : ticket.customer_phone],
                ["Address", ticket.is_for_self ? ticket.user.address : ticket.customer_address],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-500 mb-1">
                    {label} {label === "Name" && !ticket.is_for_self ? "(Recipient)" : label === "Name" ? "" : "(Account)"}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{value}</p>
                    {label === "Phone" && value && (
                      <a href={`https://wa.me/${(value as string).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600 transition-colors" title="Chat on WhatsApp">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                      </a>
                    )}
                    {label === "Email" && value && (
                      <a href={`mailto:${value}`} className="text-indigo-500 hover:text-indigo-600 transition-colors" title="Send Email">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      </a>
                    )}
                  </div>
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
              <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                <Badge variant={log.new_status} technicianId={ticket.technician_id} />
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>Status updated to {log.new_status.replace("_", " ").toUpperCase()}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {log.changer.name} • {formatDateTime(log.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
