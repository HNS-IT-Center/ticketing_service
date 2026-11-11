import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { publicTicketPath } from "@/lib/routes";
import { formatDateTime } from "@/lib/utils";
import { ticketPartyName } from "@/lib/ticket-party";
import { loadChargesPanel } from "@/lib/charges-server";
import Badge from "@/components/ui/Badge";
import WorkingTimeDisplay from "@/app/admin/tickets/[id]/WorkingTimeDisplay";
import ReplacedPartsPanel from "@/app/technician/tickets/[id]/ReplacedPartsPanel";
import RmaStatusCard from "@/components/rma/RmaStatusCard";
import ChargesPanel from "@/components/service/ChargesPanel";
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

/**
 * One ticket, read only: everything the technician's page shows, none of its
 * controls — no status changes, chat, pickup method or WhatsApp buttons. Used
 * by the kepala toko and Admin Stok; the caller decides who may see which
 * ticket and passes only an id it has cleared.
 */
export async function ReadOnlyTicketView({
  id,
  viewerId,
  back,
  lead,
}: {
  id: string;
  viewerId: string;
  back: { href: string; label: string };
  /** Shown first in the main column. */
  lead?: ReactNode;
}) {
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone_number: true, address: true } },
      technician: { select: { name: true } },
      store_location: { select: { name: true } },
      attachments: true,
      status_logs: { orderBy: { created_at: "desc" }, take: 30, include: { changer: { select: { name: true } } } },
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
            select: { id: true, from_status: true, to_status: true, note: true, created_at: true, actor: { select: { id: true, name: true } } },
          },
        },
      },
      upgrade_details: { include: { upgrade: true } },
      pc_components: { orderBy: { id: "asc" } },
      pc_build_detail: true,
      time_logs: { orderBy: { created_at: "asc" } },
      replaced_parts: {
        orderBy: { created_at: "asc" },
        include: {
          recorded_by: { select: { name: true } },
          photos: { select: { id: true, file_url: true }, orderBy: { created_at: "asc" } },
        },
      },
    },
  });
  if (!ticket) notFound();

  // The bill, read only: nobody in this portal may edit it, and a cost the
  // viewer may not see (Pengaturan Akses) is removed on the server.
  const chargesPanel = await loadChargesPanel(viewerId, ticket);

  const isPaused = ticket.time_logs.length > 0 && ticket.time_logs[ticket.time_logs.length - 1].event === "PAUSE";
  const isDone = ["completed", "cancelled", "rejected"].includes(ticket.status);
  const serializedTimeLogs = ticket.time_logs.map((l) => ({ id: l.id, event: l.event, created_at: l.created_at.toISOString() }));
  const proofAttachments = ticket.attachments.filter((a) => proofKindOf(a.file_url));
  const regularAttachments = ticket.attachments.filter((a) => !proofKindOf(a.file_url));

  const historyEvents: HistoryEvent[] = [
    ...ticket.status_logs
      .filter((log) => log.old_status !== log.new_status)
      .map((log) => ({
        id: `status_${log.id}`,
        variant: log.new_status,
        isPaused: false,
        text: `Status updated to ${log.new_status.replace(/_/g, " ").toUpperCase()}`,
        userName: log.changer.name,
        date: log.created_at,
      })),
    ...ticket.time_logs
      .filter((log) => log.event === "PAUSE" || log.event === "RESUME")
      .map((log) => ({
        id: `time_${log.id}`,
        variant: "on_progress",
        isPaused: log.event === "PAUSE",
        text: log.event === "PAUSE" ? "Work Paused" : "Work Resumed, Status updated to ON PROGRESS",
        userName: ticket.technician?.name ?? "Technician",
        date: log.created_at,
      })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    // ReplacedPartsPanel and ChargesPanel carry legacy markup, so the root has
    // no data-slot (the UI-1 rule); every section brings its own.
    <div className="flex flex-col gap-6">
      <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {back.label}
      </Link>
      <TicketHeader
        code={ticket.ticket_code}
        badge={<Badge variant={ticket.status} technicianId={ticket.technician_id} isPaused={isPaused} />}
        subtitle={`${ticket.ticket_type.replace("_", " ")} • ${ticket.device_type.replace(/_/g, " ")} • ${ticket.store_location?.name ?? "—"} • Teknisi: ${ticket.technician?.name ?? "belum ada"}`}
        deviceName={ticket.device_name}
        deviceSku={ticket.device_sku}
        deviceSn={ticket.device_sn}
        accessories={ticket.accessories}
        warrantyStatus={ticket.warranty_status}
        publicHref={ticket.public_share_token ? publicTicketPath(ticket.created_at, ticket.public_share_token, ticket.public_short_code) ?? "#" : null}
        meta={
          <span className="inline-flex w-fit self-start items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Eye aria-hidden className="size-3.5" /> Hanya lihat
          </span>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {lead}
          <CustomerInfoCard
            isForSelf={ticket.is_for_self}
            name={ticketPartyName(ticket)}
            email={ticket.is_for_self ? ticket.user?.email : ticket.customer_email}
            phone={ticket.is_for_self ? ticket.user?.phone_number : ticket.customer_phone}
            address={ticket.is_for_self ? ticket.user?.address : ticket.customer_address}
            pickup={
              <p className="text-sm text-muted-foreground">
                Pengambilan: <span className="font-medium text-foreground">{ticket.pickup_method === "courier" ? "Kurir" : "Ambil sendiri"}</span>
              </p>
            }
          />

          {ticket.notes && (
            <DetailCard title="Problem Description">
              <div className="tiptap-content min-h-0 p-0" dangerouslySetInnerHTML={{ __html: ticket.notes }} />
            </DetailCard>
          )}

          <UpgradesCard details={ticket.upgrade_details} />
          <PcComponentsCard components={ticket.pc_components} detail={ticket.pc_build_detail} />
          {ticket.rma_case && <RmaStatusCard rmaCase={ticket.rma_case} />}
          <AttachmentsCard attachments={regularAttachments} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <StatusHistoryCard events={historyEvents} technicianId={ticket.technician_id} />
          {ticket.time_logs.length > 0 && (
            // eslint-disable-next-line react-hooks/purity -- server component, read once
            <WorkingTimeDisplay timeLogs={serializedTimeLogs} isDone={isDone} serverNow={Date.now()} />
          )}
          <ProofAttachmentsCard attachments={proofAttachments} />
          {ticket.ticket_type === "service" && (
            <ReplacedPartsPanel
              canEdit={false}
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
        </div>
      </div>
    </div>
  );
}
