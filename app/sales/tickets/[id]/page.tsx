import EditTicketButton from "@/components/tickets/EditTicketButton";
import { loadTicketEdit } from "@/lib/ticket-edit-server";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { publicTicketPath } from "@/lib/routes";
import { notFound } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/components/TicketChat";
import StatusUpdater from "@/app/technician/tickets/[id]/StatusUpdater";
import { markMessagesReadAction } from "@/app/actions/tickets";
import { Link2 } from "lucide-react";
import { formatDateTime, calculateWorkingTimeMs, formatWorkingTime } from "@/lib/utils";
import CustomerWhatsAppActions from "@/app/admin/tickets/[id]/CustomerWhatsAppActions";
import PickupMethodSelector from "@/components/ui/PickupMethodSelector";
import PcBuildHandover from "@/app/admin/tickets/[id]/PcBuildHandover";
import WorkingTimeDisplay from "@/app/admin/tickets/[id]/WorkingTimeDisplay";
import RmaStatusCard from "@/components/rma/RmaStatusCard";
import { ticketPartyName } from "@/lib/ticket-party";
import ChargesPanel from "@/components/service/ChargesPanel";
import { loadChargesPanel } from "@/lib/charges-server";
import { PcComponentsCard, UpgradesCard } from "@/components/tickets/IntakeItems";
import { AttachmentsCard, ProofAttachmentsCard } from "@/components/tickets/TicketSections";
import { proofKindOf } from "@/components/tickets/proof";

export const metadata = { title: "Ticket Detail — HNS IT Center" };

export default async function SalesTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Sales", "Administrator");
  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: {
      OR: [
        { id },
        { ticket_code: id }
      ]
    },
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
      rma_case: {
        select: {
          rma_code: true,
          status: true,
          unit_ownership: true,
          stock_origin: true,
          sn_verified: true,
          physical_condition: true,
          fault_description: true,
          test_result: true,
          hold_reason: true,
          vendor_name: true,
          vendor_rma_number: true,
          shipping_tracking: true,
          submitted_at: true,
          decision: true,
          decision_notes: true,
          replacement_sn: true,
          decided_at: true,
          unit_received_at: true,
          closed_at: true,
          handed_over_at: true,
          handed_over_by: { select: { id: true, name: true } },
          handler: { select: { id: true, name: true } },
          events: {
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              from_status: true,
              to_status: true,
              note: true,
              created_at: true,
              actor: { select: { id: true, name: true } },
            },
          },
        },
      },
      cleaning_detail: true,
      upgrade_details: { include: { upgrade: true } },
      pc_components: { orderBy: { id: "asc" } },
      pc_build_detail: true,
      time_logs: { orderBy: { created_at: "asc" } },
    },
  });

  if (!ticket) notFound();

  // Mark messages read
  await markMessagesReadAction(id);

  const isAssignedSales = ticket.sales_id === session.userId;
  const isAssignedTechnician = ticket.technician_id === session.userId;

  // The bill — service tickets only. A cost the viewer may not see is removed
  // on the server, before anything reaches the browser.
  const chargesPanel = await loadChargesPanel(session.userId, ticket);
  const ticketEdit = await loadTicketEdit(session.userId, ticket.id);

  const isPaused = ticket.time_logs.length > 0 && ticket.time_logs[ticket.time_logs.length - 1].event === "PAUSE";
  const isDone = ["completed", "cancelled", "rejected"].includes(ticket.status);
  const serializedTimeLogs = ticket.time_logs.map(l => ({ id: l.id, event: l.event, created_at: l.created_at.toISOString() }));

  const proofAttachments = ticket.attachments.filter((a) => proofKindOf(a.file_url));
  const regularAttachments = ticket.attachments.filter((a) => !proofKindOf(a.file_url));

  const historyEvents = [
    ...ticket.status_logs
      .filter(log => log.old_status !== log.new_status)
      .map(log => ({
        id: `status_${log.id}`,
        variant: log.new_status,
        isPaused: false,
        text: `Status updated to ${log.new_status.replace(/_/g, " ").toUpperCase()}`,
        userName: log.changer.name,
        date: log.created_at
      })),
    ...ticket.time_logs
      .filter(log => log.event === "PAUSE" || log.event === "RESUME")
      .map(log => ({
        id: `time_${log.id}`,
        variant: "on_progress",
        isPaused: log.event === "PAUSE",
        text: log.event === "PAUSE" ? "Work Paused" : "Work Resumed, Status updated to ON PROGRESS",
        userName: ticket.technician?.name ?? "Technician",
        date: log.created_at
      }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.25rem" }}>{ticket.ticket_code}</h1>
            <Badge variant={ticket.status} technicianId={ticket.technician_id} isPaused={isPaused} />
          </div>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem", textTransform: "capitalize" }}>
            {ticket.ticket_type.replace("_", " ")} • {ticket.device_type.replace(/_/g, " ")}
          </p>
          {ticket.device_name && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", marginTop: "0.15rem", fontWeight: 500 }}>
              Device: {ticket.device_name}
              {ticket.device_sku && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · SKU {ticket.device_sku}</span>
              )}
            </p>
          )}
          {ticket.device_sn && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", marginTop: "0.15rem", fontWeight: 500 }}>
              SN: {ticket.device_sn}
            </p>
          )}
          {ticket.accessories && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", marginTop: "0.15rem", fontWeight: 500 }}>
              Kelengkapan: {ticket.accessories}
            </p>
          )}
          {ticketEdit && (
            <div style={{ marginTop: "0.5rem" }}>
              <EditTicketButton {...ticketEdit} />
            </div>
          )}
          {ticket.warranty_status && (
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
              {ticket.warranty_status.split(", ").map(w => (
                <span key={w} style={{ fontSize: "0.7rem", background: "var(--cream)", border: "1px solid var(--border)", padding: "0.1rem 0.4rem", borderRadius: "4px", color: "var(--text-secondary)", fontWeight: 600 }}>{w}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 items-start md:items-end mt-2 md:mt-0">
          {isAssignedSales && (
            <StatusUpdater
              ticketId={ticket.id}
              currentStatus={ticket.status}
              timeLogs={ticket.time_logs}
              pickupMethod={(ticket.pickup_method as "self_pickup" | "courier" | null) ?? "self_pickup"}
              isSalesMode={true}
              ticketType={ticket.ticket_type}
              intakeOwnership={
                ticket.warranty_detail?.unit_ownership
                  ? {
                      unit_ownership: ticket.warranty_detail.unit_ownership,
                      stock_origin: ticket.warranty_detail.stock_origin,
                    }
                  : null
              }
            />
          )}
          {ticket.public_share_token && (
            <Link
              href={publicTicketPath(ticket.created_at, ticket.public_share_token, ticket.public_short_code) ?? "#"}
              target="_blank"
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100"
            >
              <Link2 size={16} /> Public Link
            </Link>
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
                ["Name", ticketPartyName(ticket)],
                ["Email", ticket.is_for_self ? ticket.user?.email : ticket.customer_email],
                ["Phone", ticket.is_for_self ? ticket.user?.phone_number : ticket.customer_phone],
                ["Address", ticket.is_for_self ? ticket.user?.address : ticket.customer_address],
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
              <PickupMethodSelector ticketId={ticket.id} initialMethod={ticket.pickup_method || "self_pickup"} ticketType={ticket.ticket_type} />
            </div>

            <CustomerWhatsAppActions 
              customerPhone={(ticket.is_for_self ? ticket.user?.phone_number : ticket.customer_phone) || ""}
              customerName={(ticketPartyName(ticket)) || "Customer"}
              ticketCode={ticket.ticket_code}
              status={ticket.status}
              publicLink={publicTicketPath(ticket.created_at, ticket.public_share_token, ticket.public_short_code)?.slice(1) ?? null}
            />
          </div>

          {/* Notes */}
          {ticket.notes && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Problem Description</h3>
              <div className="tiptap-content" style={{ minHeight: "unset" }} dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </div>
          )}

          {chargesPanel && <ChargesPanel ticketId={ticket.id} {...chargesPanel} />}

          {/* What came in: upgrades with the item fitted, PC build components */}
          <UpgradesCard details={ticket.upgrade_details} />
          <PcComponentsCard components={ticket.pc_components} detail={ticket.pc_build_detail} />

          {/* PC Build Handover Verification */}
          {ticket.rma_case && <RmaStatusCard rmaCase={ticket.rma_case} />}

          {ticket.ticket_type === "pc_build" && (
            <PcBuildHandover
              ticketId={ticket.id}
              firstBuildUrl={ticket.pc_build_detail?.first_build_url ?? null}
              revisionBuildUrl={ticket.pc_build_detail?.revision_build_url ?? null}
              status={ticket.status}
              userRole={session.role}
              isAssignedSales={isAssignedSales}
              isAssignedTechnician={isAssignedTechnician}
            />
          )}

          {/* Regular Attachments — the shared card, so photos, videos and PDFs
              open in the pop-up gallery instead of a new tab. */}
          <AttachmentsCard attachments={regularAttachments} />

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

        {/* Right Sidebar Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Status log */}
          <div className="card" style={{ alignSelf: "flex-start", width: "100%" }}>
            <h3 style={{ marginBottom: "1rem" }}>Status History</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {historyEvents.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No status changes yet</p>
              ) : (
                historyEvents.map((event) => {
                  const bg = event.isPaused
                    ? "#fef9c3"
                    : event.variant === "on_progress" ? "#eff6ff"
                    : event.variant === "done" ? "#f0fdf4"
                    : event.variant === "waiting" ? "#fffbeb"
                    : event.variant === "cancelled" || event.variant === "rejected" ? "#fff1f2"
                    : event.variant === "ready_for_pickup" || event.variant === "waiting_pickup" || event.variant === "handed_to_courier" || event.variant === "delivered" || event.variant === "completed" ? "#f0fdf4"
                    : "#f8fafc";
                  const border = event.isPaused
                    ? "#fde68a"
                    : event.variant === "on_progress" ? "#bfdbfe"
                    : event.variant === "done" ? "#bbf7d0"
                    : event.variant === "waiting" ? "#fde68a"
                    : event.variant === "cancelled" || event.variant === "rejected" ? "#fecdd3"
                    : event.variant === "ready_for_pickup" || event.variant === "waiting_pickup" || event.variant === "handed_to_courier" || event.variant === "delivered" || event.variant === "completed" ? "#bbf7d0"
                    : "#e2e8f0";
                  return (
                    <div key={event.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "0.5rem", padding: "0.625rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      <Badge variant={event.variant} technicianId={ticket.technician_id} isPaused={event.isPaused} />
                      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-primary)" }}>{event.text}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {event.userName} • {formatDateTime(event.date)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Working Time Widget */}
          {ticket.time_logs.length > 0 && (
            <WorkingTimeDisplay timeLogs={serializedTimeLogs} isDone={isDone} serverNow={Date.now()} />
          )}

          {/* Proof Attachments — shown below working time */}
          <ProofAttachmentsCard attachments={proofAttachments} />
        </div>
      </div>

      {/* StatusUpdater pins its actions to the bottom of a phone screen; this
          keeps the last card clear of them (a height: the root has no data-slot). */}
      {isAssignedSales && <div aria-hidden="true" className="h-20 md:hidden" />}
    </div>
  );
}
