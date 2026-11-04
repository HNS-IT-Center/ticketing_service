import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { publicTicketPath } from "@/lib/routes";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import TicketChat from "@/components/TicketChat";
import AdminAssignPanel from "./AdminAssignPanel";
import AdminStatusPanel from "./AdminStatusPanel";
import AdminWorkflowPanel from "./AdminWorkflowPanel";
import PublicChatToggle from "./PublicChatToggle";
import { MapPin } from "lucide-react";
import { cn, formatDateTime, calculateWorkingTimeMs } from "@/lib/utils";
import PcBuildHandover from "./PcBuildHandover";
import CustomerWhatsAppActions from "./CustomerWhatsAppActions";
import WorkingTimeDisplay from "./WorkingTimeDisplay";
import PickupMethodSelector from "@/components/ui/PickupMethodSelector";
import RmaStatusCard from "@/components/rma/RmaStatusCard";
import DeleteTicketPanel from "./DeleteTicketPanel";
import { servicePartLabel } from "@/lib/service-parts";
import { ticketPartyName } from "@/lib/ticket-party";
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
  PublicLink,
  StatusHistoryCard,
  TicketHeader,
  type HistoryEvent,
} from "@/components/tickets/TicketSections";
import { TONE_CLASSES } from "@/lib/status-display";

export const metadata = { title: "Ticket Detail — Admin" };

const PILL = "inline-flex rounded-full border px-2.5 py-0.5 text-[0.71875rem] font-bold whitespace-nowrap";

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("Administrator", "Sales");
  const { id } = await params;

  const [ticket, technicians, salesUsers] = await Promise.all([
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
        pc_components: true,
        attachments: true,
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
          include: { technician: { select: { name: true } } },
        },
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

  // Sales authorization guard: cannot access if not assigned
  if (session.role === "Sales" && ticket.sales_id !== session.userId) {
    notFound();
  }

  // The bill — service tickets only. A cost the viewer may not see is removed
  // on the server, before anything reaches the browser.
  const chargesPanel = await loadChargesPanel(session.userId, ticket);

  const isPaused = ticket.time_logs.length > 0 && ticket.time_logs[ticket.time_logs.length - 1].event === "PAUSE";
  const workingTimeMs = calculateWorkingTimeMs(ticket.time_logs);
  const isDone = ["done", "completed", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered", "cancelled", "rejected"].includes(ticket.status);
  // Serialize time_logs dates to ISO strings for client component
  const serializedTimeLogs = ticket.time_logs.map(l => ({ event: l.event, created_at: l.created_at.toISOString() }));

  // ── Proof attachment detection ──────────────────────────────────────────────
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

  const publicHref = ticket.public_share_token ? publicTicketPath(ticket.created_at, ticket.public_share_token, ticket.public_short_code) ?? "#" : null;
  const customerPhone = ticket.is_for_self ? ticket.user?.phone_number : ticket.customer_phone;
  const isAdmin = session.role === "Administrator";

  return (
    <div data-slot="admin-ticket-detail" className="flex flex-col gap-6">
      <TicketHeader
        code={ticket.ticket_code}
        badge={<Badge variant={ticket.status} technicianId={ticket.technician_id} isPaused={isPaused} />}
        codeTag={
          ticket.store_location && (
            <span className={cn("rounded border px-2 py-0.5 font-mono text-xs font-semibold", TONE_CLASSES.violet)}>
              {ticket.store_location.code}
            </span>
          )
        }
        subtitle={`${ticket.ticket_type.replace(/_/g, " ")} • ${ticket.device_type.replace(/_/g, " ")}`}
        deviceName={ticket.device_name}
        deviceSku={ticket.device_sku}
        deviceSn={ticket.device_sn}
        accessories={ticket.accessories}
        warrantyStatus={ticket.warranty_status}
        meta={
          <>
            {ticket.store_location && (
              <p className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" /> {ticket.store_location.name}
              </p>
            )}
            <p className="text-[0.8125rem] text-muted-foreground">Created {formatDateTime(ticket.created_at)}</p>
          </>
        }
        actions={
          <>
            <AdminStatusPanel ticketId={ticket.id} currentStatus={ticket.status} ticketType={ticket.ticket_type} />
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2 md:gap-4">
              {publicHref && (
                <>
                  <PublicLink href={publicHref} />
                  <div aria-hidden="true" className="h-5 w-px bg-border" />
                </>
              )}
              <PublicChatToggle ticketId={ticket.id} initialEnabled={ticket.public_chat_enabled} />
            </div>
          </>
        }
      />

      {/* Service finished, a fitted part still without its Accurate code. */}
      <PartCodePendingBanner
        count={partsAwaitingCodeCount(ticket)}
        canLink={Boolean(chargesPanel?.perms.canLinkPartCode && chargesPanel.catalogEnabled)}
      />

      {/* On a phone the two columns melt into one list (display: contents) so
          the assignment can sit right under the customer — the owner's call,
          2026-11-02. From lg up it is back in the side column. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="max-lg:order-first">
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
                  publicLink={publicTicketPath(ticket.created_at, ticket.public_share_token, ticket.public_short_code)?.slice(1) ?? null}
                />
              }
            />
          </div>

          {/* Workflow panel — CS handover actions */}
          <AdminWorkflowPanel
            ticketId={ticket.id}
            // The panel names only the statuses it acts on; rma_process is not one of them.
            currentStatus={ticket.status as React.ComponentProps<typeof AdminWorkflowPanel>["currentStatus"]}
            pickupMethod={ticket.pickup_method}
            customerAddress={ticket.is_for_self ? ticket.user?.address : ticket.customer_address}
            userRole={session.role}
          />

          {/* Notes */}
          {ticket.notes && (
            <DetailCard title="Problem Description">
              {/* Saved editor HTML; .tiptap-content keeps its paragraph and list styles. */}
              <div className="tiptap-content min-h-0 p-0" dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </DetailCard>
          )}

          {/* Warranty detail */}
          {ticket.rma_case && <RmaStatusCard rmaCase={ticket.rma_case} />}

          {ticket.warranty_detail && (
            <DetailCard title="Warranty Information">
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>
                  Purchase Date:{" "}
                  <strong className="font-semibold text-foreground">
                    {ticket.warranty_detail.purchase_date
                      ? new Date(ticket.warranty_detail.purchase_date).toLocaleDateString("id-ID")
                      : "—"}
                  </strong>
                </p>
                {ticket.warranty_detail.unit_ownership && (
                  <p>
                    Unit:{" "}
                    <strong className="font-semibold text-foreground">
                      {ticket.warranty_detail.unit_ownership === "store_stock"
                        ? `Stok Toko — ${ticket.warranty_detail.stock_origin ?? ""}`
                        : "Milik Customer"}
                    </strong>
                  </p>
                )}
              </div>
            </DetailCard>
          )}

          {/* Cleaning detail */}
          {ticket.cleaning_detail && (
            <DetailCard title="Cleaning Service">
              <span className={cn(PILL, TONE_CLASSES.blue)}>{ticket.cleaning_detail.service_package.replace("_", " ")}</span>
            </DetailCard>
          )}

          {/* Parts replaced during the service. Read-only here: the technician
              who fitted them records them, on their own ticket page. */}
          {ticket.replaced_parts.length > 0 && (
            <DetailCard title="Part yang Diganti">
              <ul>
                {ticket.replaced_parts.map((p) => (
                  <li key={p.id} className="border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(PILL, TONE_CLASSES.blue)}>{servicePartLabel(p.part)}</span>
                      {p.item_name && <span className="text-sm font-semibold [overflow-wrap:anywhere]">{p.item_name}</span>}
                      {p.quantity > 1 && <span className="text-[0.8125rem] font-bold">× {p.quantity}</span>}
                      {p.sku && <span className="text-xs text-muted-foreground">SKU {p.sku}</span>}
                    </div>
                    {p.notes && (
                      <p className="mt-1.5 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">{p.notes}</p>
                    )}
                    {p.photos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg leading-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.file_url}
                              alt={`Foto ${servicePartLabel(p.part)}`}
                              className="size-[58px] rounded-lg border border-border object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p.recorded_by.name} · {formatDateTime(p.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </DetailCard>
          )}

          {chargesPanel && <ChargesPanel ticketId={ticket.id} {...chargesPanel} />}

          {/* What came in: upgrades with the item fitted, PC build components */}
          <UpgradesCard details={ticket.upgrade_details} />
          <PcComponentsCard components={ticket.pc_components} />

          {/* PC Build Handover Verification */}
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

          {/* Regular Attachments */}
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
              isOwn: false,
            }))}
            currentUserId="admin"
          />
        </div>

        {/* Right Sidebar Column */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <StatusHistoryCard events={historyEvents} technicianId={ticket.technician_id} />

          {/* Working Time Widget */}
          {ticket.time_logs.length > 0 && (
            <WorkingTimeDisplay timeLogs={serializedTimeLogs} isDone={isDone} serverNow={Date.now()} />
          )}

          {/* Proof Attachments — shown below working time */}
          <ProofAttachmentsCard attachments={proofAttachments} />

          {/* Assignment panel (Admin only) — first after the customer on a phone */}
          {isAdmin && (
            <div className="max-lg:order-first">
              <AdminAssignPanel
                ticketId={ticket.id}
                currentTechnicianId={ticket.technician_id}
                currentSalesId={ticket.sales_id}
                technicians={technicians}
                salesUsers={salesUsers}
                assignmentRequests={ticket.assignment_requests}
                ticketStatus={ticket.status}
              />
            </div>
          )}

          {/* Permanent deletion — administrators only, and last on the page so
              it is never the first thing a hand lands on. */}
          {isAdmin && (
            <DeleteTicketPanel ticketId={ticket.id} ticketCode={ticket.ticket_code} />
          )}
        </div>
      </div>
    </div>
  );
}
