import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, Info, MapPin, MessageSquareOff, Play, Wrench } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  getPublicClaimOutcome,
  publicStatusLabel,
} from "@/lib/rma/public-status";
import PublicChat from "./PublicChat";

export const metadata = { title: "Ticket Status — HNS IT Center" };

// Statuses that carry visual proof uploads (image/video only shown on public page)
const PROOF_STATUSES = new Set([
  "done",
  "completed",
  "handed_to_courier",
  "delivered",
  "ready_for_pickup",
  "waiting_pickup",
]);

export default async function PublicTicketPage({
  params,
}: {
  params: Promise<{ date: string; shareToken: string }>;
}) {
  const { date, shareToken } = await params;

  // Looked up by token, not by ticket_code.
  //
  // Codes run NGW-000001..NGW-000372 with no gaps, and `date` has never been
  // part of the lookup — it is decorative. Resolving by code therefore let
  // anyone count upwards and read every customer's device name, serial number,
  // complaint and public chat. The token is random and unique, so a link opens
  // only the ticket it was issued for.
  const ticket = await db.ticket.findUnique({
    where: { public_share_token: shareToken },
    include: {
      user: { select: { name: true } },
      store_location: { select: { name: true, code: true } },
      status_logs: {
        orderBy: { created_at: "asc" },
        include: { changer: { select: { name: true, role: true } } },
      },
      messages: {
        where: { /* only show messages if public chat is enabled — checked below */ },
        orderBy: { created_at: "asc" },
        include: { sender: { select: { name: true, role: true } } },
      },
      time_logs: { orderBy: { created_at: "asc" } },
      attachments: {
        orderBy: { created_at: "asc" },
        where: { file_type: { in: ["image", "video"] } },
      },
      // Warranty claims only. Selected field by field on purpose: the rest of
      // RmaCase (vendor_rma_number, hold_reason, decision_notes, stock_origin,
      // stock_transfer_number, customer_ticket_number) is internal and must
      // never reach this page.
      warranty_detail: {
        select: { claim_eligible: true, ineligibility_reason: true },
      },
      rma_case: { select: { status: true, decision: true } },
    },
  });

  if (!ticket) notFound();

  // A claim can end three different ways and all three finish `done` →
  // `completed`. Without this banner the customer cannot tell them apart.
  const claimOutcome = getPublicClaimOutcome({
    ticketType: ticket.ticket_type,
    ticketStatus: ticket.status,
    claimEligible: ticket.warranty_detail?.claim_eligible ?? null,
    ineligibilityReason: ticket.warranty_detail?.ineligibility_reason ?? null,
    rmaStatus: ticket.rma_case?.status ?? null,
    rmaDecision: ticket.rma_case?.decision ?? null,
  });

  const OUTCOME_STYLES = {
    progress: { classes: "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg", Icon: Wrench },
    success: { classes: "border-tone-green-border bg-tone-green-bg text-tone-green-fg", Icon: CheckCircle2 },
    warning: { classes: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg", Icon: AlertTriangle },
    neutral: { classes: "border-tone-gray-border bg-tone-gray-bg text-tone-gray-fg", Icon: Info },
  } as const;

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") || "https";
  const appUrl = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "");
  const shareUrl = `${appUrl}/${date}/${shareToken}`;

  let totalTimeMs = 0;
  let lastStartTime: Date | null = null;
  for (const log of ticket.time_logs) {
    if (log.event === "START" || log.event === "RESUME") {
      lastStartTime = log.created_at;
    } else if ((log.event === "PAUSE" || log.event === "DONE") && lastStartTime) {
      totalTimeMs += log.created_at.getTime() - lastStartTime.getTime();
      lastStartTime = null;
    }
  }
  // If still actively working, add time up to now
  if (lastStartTime && ticket.status === "on_progress" && !ticket.time_logs.find(l => l.event === "PAUSE" && l.created_at > lastStartTime!)) {
    totalTimeMs += Date.now() - lastStartTime.getTime();
  }

  const formatDuration = (ms: number) => {
    if (ms === 0) return "Belum dimulai";
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} Hari ${hours % 24} Jam`;
    if (hours > 0) return `${hours} Jam ${mins % 60} Menit`;
    return `${mins} Menit`;
  };

  /**
   * Match attachments to a status log entry by timestamp proximity.
   * Attachments are created in the same server action as the status log,
   * so their created_at will be within a few seconds of the log's created_at.
   * We use a ±15-second window and only match image/video types.
   */
  function getProofMedia(logCreatedAt: Date) {
    const WINDOW_MS = 15_000; // ±15 seconds
    return ticket!.attachments.filter((a) => {
      const diff = Math.abs(a.created_at.getTime() - logCreatedAt.getTime());
      return diff <= WINDOW_MS;
    });
  }

  return (
    // Outside the staff shell and built from tokens only, so the page opts
    // into Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="public-ticket" className="flex min-h-screen flex-col items-center bg-background px-4 py-8">
      <div className="flex w-full max-w-[600px] flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hns.jpg" alt="HNS IT Center" className="size-12 rounded-[10px] object-cover" />
          <div className="flex flex-col items-start">
            <div className="text-xl leading-tight font-extrabold tracking-tight text-foreground">HNS IT Center</div>
            <div className="mt-0.5 text-sm font-medium text-muted-foreground">Ticket Status Tracker</div>
          </div>
        </div>

        {/* Ticket card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Ticket header */}
          <div className="bg-[linear-gradient(135deg,var(--primary),var(--accent-brand))] px-5 py-6 md:px-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 text-xs text-white/80">Nomor Tiket</div>
                <div className="font-mono text-[1.375rem] font-extrabold text-white">{ticket.ticket_code}</div>
              </div>
              {/* The customer's word for the status — the same one the timeline
                  below uses — not the staff badge. */}
              <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[0.8125rem] font-semibold whitespace-nowrap text-primary shadow-xs">
                {publicStatusLabel(ticket.status)}
              </span>
            </div>
            {ticket.store_location && (
              <div className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-white/85">
                <MapPin aria-hidden="true" className="size-3.5" />
                {ticket.store_location.name}
              </div>
            )}
          </div>

          {/* Claim outcome — warranty claims only */}
          {claimOutcome && (() => {
            const tone = OUTCOME_STYLES[claimOutcome.tone];
            const Icon = tone.Icon;
            return (
              <div className={cn("mx-5 mt-5 flex items-start gap-3 rounded-xl border px-4 py-3.5 md:mx-7", tone.classes)}>
                <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[0.9375rem] leading-snug font-semibold">{claimOutcome.headline}</div>
                  {claimOutcome.detail && (
                    <div className="mt-1.5 text-[0.8125rem] leading-normal opacity-85 [overflow-wrap:anywhere]">
                      {claimOutcome.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Ticket infos */}
          <dl className="grid grid-cols-2 gap-4 border-b border-border px-5 py-6 md:px-7">
            {[
              ["Tipe Layanan", ticket.ticket_type.replace(/_/g, " ")],
              ["Perangkat", ticket.device_type.replace(/_/g, " ")],
              ...(ticket.device_name ? [["Nama Perangkat", ticket.device_name]] : []),
              ...(ticket.device_sn ? [["Nomor Seri (SN)", ticket.device_sn]] : []),
              ...(ticket.accessories ? [["Kelengkapan", ticket.accessories]] : []),
              ...(ticket.warranty_status ? [["Kondisi", ticket.warranty_status]] : []),
              ["Dibuat", formatDateTime(ticket.created_at)],
              ["Pengiriman", ticket.pickup_method === "courier" ? "Kurir" : ticket.pickup_method === "self_pickup" ? "Ambil Sendiri" : "—"],
              ["Waktu Kerja Aktif", formatDuration(totalTimeMs)],
              ...(ticket.is_overnight_check ? [["Cek & Diagnosa", "Overnight (Fee Rp. 50,000)"]] : []),
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="mb-0.5 text-xs text-muted-foreground">{label}</dt>
                <dd className="text-[0.9rem] font-medium text-foreground capitalize [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Status timeline */}
          <div className="px-5 py-6 md:px-7">
            <h2 className="mb-4 text-[0.9375rem] font-semibold text-foreground">Riwayat Status</h2>
            <ol className="flex flex-col">
              {ticket.status_logs.map((log, i) => {
                const isLatest = i === ticket.status_logs.length - 1;
                const showProof = PROOF_STATUSES.has(log.new_status);
                const proofMedia = showProof ? getProofMedia(log.created_at) : [];

                return (
                  <li key={log.id} className="flex items-stretch">
                    {/* Timeline spine */}
                    <div className="flex w-7 shrink-0 flex-col items-center">
                      <div
                        aria-hidden="true"
                        className={cn(
                          "z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold",
                          isLatest ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </div>
                      {/* Connector line to next item */}
                      {i < ticket.status_logs.length - 1 && (
                        <div aria-hidden="true" className="my-0.5 min-h-5 w-0.5 flex-1 bg-border" />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn("min-w-0 flex-1 pl-3.5", i < ticket.status_logs.length - 1 && "pb-4")}>
                      <div className={cn("text-sm font-semibold", isLatest ? "text-foreground" : "text-foreground/80")}>
                        {publicStatusLabel(log.new_status)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</div>

                      {/* Proof media — images & videos attached to this status step */}
                      {proofMedia.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {proofMedia.map((media) => (
                            <a
                              key={media.id}
                              href={media.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Lihat bukti"
                              className="relative block size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-[#111] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              {media.file_type === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={media.file_url} alt="Bukti" className="size-full object-cover" />
                              ) : (
                                /* video thumbnail — browser renders first frame */
                                <video src={media.file_url} className="size-full object-cover" muted playsInline preload="metadata" />
                              )}
                              {/* play icon overlay for video */}
                              {media.file_type === "video" && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                                  <Play aria-hidden="true" className="size-6 fill-white text-white" />
                                </div>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Public chat section */}
        {ticket.public_chat_enabled ? (
          <PublicChat
            ticketId={ticket.id}
            shareToken={ticket.public_share_token || ""}
            messages={ticket.messages.map((m) => ({
              id: m.id,
              message: m.message,
              created_at: m.created_at.toISOString(),
              is_read: m.is_read,
              senderName: m.sender?.name ?? m.sender_name ?? "Anonymous",
              senderRole: m.sender?.role ?? "Customer",
            }))}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-5 text-center text-sm text-muted-foreground">
            <MessageSquareOff aria-hidden="true" className="size-4" />
            Chat dinonaktifkan untuk tiket ini
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          HNS IT Center · Halaman ini hanya-baca dan terisolasi
        </div>
      </div>
    </div>
  );
}
