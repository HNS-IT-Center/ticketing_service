import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { publicTicketPath } from "@/lib/routes";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/components/TicketChat";
import StatusUpdater from "./StatusUpdater";
import { markMessagesReadAction } from "@/app/actions/tickets";
import { formatDateTime } from "@/lib/utils";
import AdminAssignPanel from "@/app/admin/tickets/[id]/AdminAssignPanel";
import CustomerWhatsAppActions from "@/app/admin/tickets/[id]/CustomerWhatsAppActions";
import PickupMethodSelector from "@/components/ui/PickupMethodSelector";
import PcBuildHandover from "@/app/admin/tickets/[id]/PcBuildHandover";
import WorkingTimeDisplay from "@/app/admin/tickets/[id]/WorkingTimeDisplay";
import ReplacedPartsPanel from "./ReplacedPartsPanel";
import RmaStatusCard from "@/components/rma/RmaStatusCard";
import HoldEvidencePanel from "./HoldEvidencePanel";
import { holdReasonAsksTechnician } from "@/lib/rma/hold-reason";
import { ticketPartyName } from "@/lib/ticket-party";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";
import ChargesPanel from "@/components/service/ChargesPanel";
import { loadChargesPanel } from "@/lib/charges-server";
import PartCodePendingBanner from "@/components/service/PartCodePendingBanner";
import { partsAwaitingCodeCount } from "@/lib/part-code-alerts";
import { PcComponentsCard, UpgradesCard } from "@/components/tickets/IntakeItems";
import { proofKindOf } from "@/components/tickets/proof";
import {
  AttachmentsCard,
  CustomerInfoCard,
  DetailCard,
  ProofAttachmentsCard,
  StatusHistoryCard,
  TicketHeader,
  type HistoryEvent,
} from "@/components/tickets/TicketSections";

export const metadata = { title: "Ticket Detail — HNS IT Center" };

export default async function TechnicianTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Technician");
  const { id } = await params;

  const [ticket, currentUser] = await Promise.all([
    db.ticket.findFirst({
      where: {
        OR: [
          { id },
          { ticket_code: id }
        ]
      },
      include: {
        user: { select: { name: true, email: true, phone_number: true, address: true } },
        technician: { select: { name: true } },
        store_location: { select: { name: true, code: true } },
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
            hold_reason_code: true,
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
        pc_components: true,
        pc_build_detail: true,
        time_logs: { orderBy: { created_at: "asc" } },
        replaced_parts: {
          orderBy: { created_at: "asc" },
          include: {
            recorded_by: { select: { name: true } },
            photos: { select: { id: true, file_url: true }, orderBy: { created_at: "asc" } },
          },
        },
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

  // The bill — service tickets only. A cost the viewer may not see is removed
  // on the server, before anything reaches the browser.
  const chargesPanel = await loadChargesPanel(session.userId, ticket);

  const isPaused = ticket.time_logs.length > 0 && ticket.time_logs[ticket.time_logs.length - 1].event === "PAUSE";
  // isDone = no more technician actions possible (fully terminal statuses only)
  // ready_for_pickup and handed_to_courier still need proof upload actions, so NOT included here
  const isDone = ["completed", "cancelled", "rejected"].includes(ticket.status);
  const serializedTimeLogs = ticket.time_logs.map(l => ({ id: l.id, event: l.event, created_at: l.created_at.toISOString() }));

  // Proof files carry a name prefix (components/tickets/proof.ts).
  const proofAttachments = ticket.attachments.filter((a) => proofKindOf(a.file_url));
  const regularAttachments = ticket.attachments.filter((a) => !proofKindOf(a.file_url));

  const historyEvents: HistoryEvent[] = [
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

  const customerPhone = ticket.is_for_self ? ticket.user?.phone_number : ticket.customer_phone;

  return (
    // ReplacedPartsPanel and ChargesPanel still carry legacy markup, so the
    // root keeps no data-slot (the UI-1 rule); every section brings its own.
    <div className="flex flex-col gap-6">
      <TicketHeader
        code={ticket.ticket_code}
        badge={<Badge variant={ticket.status} technicianId={ticket.technician_id} isPaused={isPaused} />}
        subtitle={`${ticket.ticket_type.replace("_", " ")} • ${ticket.device_type.replace(/_/g, " ")}`}
        deviceName={ticket.device_name}
        deviceSku={ticket.device_sku}
        deviceSn={ticket.device_sn}
        accessories={ticket.accessories}
        warrantyStatus={ticket.warranty_status}
        publicHref={ticket.public_share_token ? publicTicketPath(ticket.created_at, ticket.public_share_token) ?? "#" : null}
        actions={
          isAssigned && (
            <StatusUpdater
              ticketId={ticket.id}
              currentStatus={ticket.status}
              timeLogs={ticket.time_logs}
              pickupMethod={(ticket.pickup_method as "self_pickup" | "courier" | null) ?? "self_pickup"}
              ticketType={ticket.ticket_type}
              intakeOwnership={
                ticket.warranty_detail?.unit_ownership
                  ? {
                      unit_ownership: ticket.warranty_detail.unit_ownership,
                      stock_origin: ticket.warranty_detail.stock_origin,
                    }
                  : null
              }
              // The handover's invoice picker: never offer a photo of the unit.
              attachments={regularAttachments
                .filter((a) => a.kind !== "unit_photo")
                .map((a) => ({
                  id: a.id,
                  file_url: a.file_url,
                  file_type: a.file_type,
                }))}
            />
          )
        }
      />

      {/* Service finished, a fitted part still without its Accurate code. */}
      <PartCodePendingBanner
        count={partsAwaitingCodeCount(ticket)}
        canLink={Boolean(chargesPanel?.perms.canLinkPartCode && chargesPanel.catalogEnabled)}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CustomerInfoCard
            isForSelf={ticket.is_for_self}
            name={ticketPartyName(ticket)}
            email={ticket.is_for_self ? ticket.user?.email : ticket.customer_email}
            phone={customerPhone}
            address={ticket.is_for_self ? ticket.user?.address : ticket.customer_address}
            pickup={<PickupMethodSelector ticketId={ticket.id} initialMethod={ticket.pickup_method || "self_pickup"} ticketType={ticket.ticket_type} />}
            footer={
              <CustomerWhatsAppActions
                customerPhone={customerPhone || ""}
                customerName={(ticketPartyName(ticket)) || "Customer"}
                ticketCode={ticket.ticket_code}
                status={ticket.status}
                publicLink={publicTicketPath(ticket.created_at, ticket.public_share_token)?.slice(1) ?? null}
              />
            }
          />

          {/* Notes */}
          {ticket.notes && (
            <DetailCard title="Problem Description">
              {/* Saved editor HTML; .tiptap-content keeps its paragraph and list styles. */}
              <div className="tiptap-content min-h-0 p-0" dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </DetailCard>
          )}

          {/* What came in: upgrades with the item fitted, PC build components */}
          <UpgradesCard details={ticket.upgrade_details} />
          <PcComponentsCard components={ticket.pc_components} />

          {/* What the desk is waiting for, above the read-only case card: the
              technician is the only one who can answer it. */}
          {ticket.rma_case?.status === "on_hold" &&
            holdReasonAsksTechnician(ticket.rma_case.hold_reason_code) && (
              <HoldEvidencePanel
                ticketId={ticket.id}
                holdReasonCode={ticket.rma_case.hold_reason_code!}
                holdReason={ticket.rma_case.hold_reason}
              />
            )}

          {ticket.rma_case && <RmaStatusCard rmaCase={ticket.rma_case} />}

          {ticket.ticket_type === "pc_build" && (
            <PcBuildHandover
              ticketId={ticket.id}
              firstBuildUrl={ticket.pc_build_detail?.first_build_url ?? null}
              revisionBuildUrl={ticket.pc_build_detail?.revision_build_url ?? null}
              status={ticket.status}
              userRole={session.role}
              isAssignedSales={ticket.sales_id === session.userId}
              isAssignedTechnician={ticket.technician_id === session.userId}
            />
          )}

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
        <div className="flex min-w-0 flex-col gap-6">
          <StatusHistoryCard events={historyEvents} technicianId={ticket.technician_id} />

          {/* Working Time Widget */}
          {ticket.time_logs.length > 0 && (
            <WorkingTimeDisplay timeLogs={serializedTimeLogs} isDone={isDone} serverNow={Date.now()} />
          )}

          {/* Proof Attachments — shown below working time */}
          <ProofAttachmentsCard attachments={proofAttachments} />

          {/* Parts replaced — service tickets only; the other types have their
              own detail tables and none of them means "a part was fitted". */}
          {ticket.ticket_type === "service" && (
            <ReplacedPartsPanel
              ticketId={ticket.id}
              canEdit={isAssigned}
              catalogEnabled={isCatalogConfigured()}
              store={ticket.store_location ?? null}
              parts={ticket.replaced_parts.map((p) => ({
                id: p.id,
                part: p.part,
                item_name: p.item_name,
                sku: p.sku,
                quantity: p.quantity,
                notes: p.notes,
                recorded_by_name: p.recorded_by.name,
                created_at: formatDateTime(p.created_at),
                photos: p.photos,
              }))}
            />
          )}

          {chargesPanel && <ChargesPanel ticketId={ticket.id} {...chargesPanel} />}

          {/* The "Extra Services" ticks were retired for the Daftar Jasa: labour is
              now a job on the bill, counted per technician (W4-J). Old tickets
              keep their ticks in extra_services; nothing writes new ones. */}

          {/* Assignment panel (Admin & Store Coordinator only) */}
          {isTeamLeader && (
            <AdminAssignPanel
              ticketId={ticket.id}
              currentTechnicianId={ticket.technician_id}
              currentSalesId={ticket.sales_id}
              technicians={technicians}
              salesUsers={salesUsers}
              assignmentRequests={ticket.assignment_requests}
              ticketStatus={ticket.status}
            />
          )}
        </div>
      </div>

      {/* On a phone the assigned technician's actions are pinned to the bottom
          of the screen (StatusUpdater); this keeps the last card clear of them.
          A height, not padding: the root has no data-slot, so padding is reset. */}
      {isAssigned && <div aria-hidden="true" className="h-20 md:hidden" />}
    </div>
  );
}
