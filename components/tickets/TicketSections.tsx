import Link from "next/link";
import {
  CheckCircle2,
  File,
  FileText,
  Film,
  Handshake,
  Link2,
  Mail,
  MailCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TONE_CLASSES, type StatusTone } from "@/lib/status-display";
import { cn, formatDateTime } from "@/lib/utils";
import { fileNameOf, proofKindOf, type ProofKind } from "./proof";

/*
 * The sections every ticket detail page shows — technician, admin, sales —
 * drawn once. Server components; each brings its own data-slot, so they sit
 * in pages that still carry legacy markup as well as migrated ones.
 */

/** A titled card, the building block of the detail pages. */
export function DetailCard({
  title,
  aside,
  children,
  className,
}: {
  title: React.ReactNode;
  /** Shown at the right of the title, e.g. a "For Someone Else" tag. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {aside}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Code, status and what the unit is — the top of a ticket page. */
export function TicketHeader({
  code,
  badge,
  subtitle,
  deviceName,
  deviceSku,
  deviceSn,
  accessories,
  warrantyStatus,
  actions,
  publicHref,
  codeTag,
  meta,
}: {
  code: string;
  badge: React.ReactNode;
  /** Beside the badge, e.g. the store code. */
  codeTag?: React.ReactNode;
  /** Muted lines under the unit, e.g. the store and when it was created. */
  meta?: React.ReactNode;
  /** "Service • Laptop Office". */
  subtitle: string;
  deviceName?: string | null;
  deviceSku?: string | null;
  deviceSn?: string | null;
  accessories?: string | null;
  /** Comma-separated conditions, shown as tags. */
  warrantyStatus?: string | null;
  /** The page's actions (status buttons…), right of the title on desktop. */
  actions?: React.ReactNode;
  publicHref?: string | null;
}) {
  return (
    <div data-slot="ticket-header" className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold tracking-tight text-foreground md:text-2xl">{code}</h1>
          {badge}
          {codeTag}
        </div>
        <p className="text-muted-foreground capitalize">{subtitle}</p>
        {deviceName && (
          <p className="text-[0.8125rem] font-medium text-foreground [overflow-wrap:anywhere]">
            Device: {deviceName}
            {deviceSku && <span className="font-normal text-muted-foreground"> · SKU {deviceSku}</span>}
          </p>
        )}
        {deviceSn && <p className="text-[0.8125rem] font-medium text-foreground">SN: {deviceSn}</p>}
        {accessories && <p className="text-[0.8125rem] font-medium text-foreground">Kelengkapan: {accessories}</p>}
        {warrantyStatus && (
          <div className="mt-1 flex flex-wrap gap-1">
            {warrantyStatus.split(", ").map((w) => (
              <span key={w} className="rounded border border-border bg-muted px-1.5 py-px text-[0.7rem] font-semibold text-muted-foreground">
                {w}
              </span>
            ))}
          </div>
        )}
        {meta}
      </div>
      {(actions || publicHref) && (
        <div className="flex flex-col items-stretch gap-3 md:items-end">
          {actions}
          {publicHref && <PublicLink href={publicHref} className="self-start md:self-end" />}
        </div>
      )}
    </div>
  );
}

/** The link to the customer-facing status page, opened in a new tab. */
export function PublicLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-tone-blue-border bg-tone-blue-bg px-3 text-sm font-medium text-tone-blue-fg transition-colors outline-none hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
        className,
      )}
    >
      <Link2 aria-hidden="true" className="size-4" /> Public Link
    </Link>
  );
}

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z";

/** Who the ticket is for, how to reach them, and the pickup choice. */
export function CustomerInfoCard({
  isForSelf,
  name,
  email,
  phone,
  address,
  pickup,
  footer,
}: {
  isForSelf: boolean;
  name: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  address: string | null | undefined;
  /** The pickup selector, under the contact lines. */
  pickup?: React.ReactNode;
  /** WhatsApp quick actions and the like. */
  footer?: React.ReactNode;
}) {
  const rows: [string, string | null | undefined][] = [
    [isForSelf ? "Name" : "Name (Recipient)", name],
    ["Email (Account)", email],
    ["Phone (Account)", phone],
    ["Address (Account)", address],
  ];
  return (
    <DetailCard
      title="Customer Information"
      aside={
        !isForSelf && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">For Someone Else</span>
        )
      }
    >
      <dl className="flex flex-col gap-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 font-medium [overflow-wrap:anywhere]">
              {value}
              {label.startsWith("Phone") && value && (
                <a
                  href={`https://wa.me/${value.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Chat on WhatsApp"
                  aria-label="Chat on WhatsApp"
                  className="-my-2 flex size-11 shrink-0 items-center justify-center rounded-md text-[#25D366] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d={WHATSAPP_PATH} />
                  </svg>
                </a>
              )}
              {label.startsWith("Email") && value && (
                <a
                  href={`mailto:${value}`}
                  title="Send Email"
                  aria-label="Send Email"
                  className="-my-2 flex size-11 shrink-0 items-center justify-center rounded-md text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
                >
                  <Mail aria-hidden="true" className="size-[18px]" />
                </a>
              )}
            </dd>
          </div>
        ))}
        {pickup}
      </dl>
      {footer}
    </DetailCard>
  );
}

type AttachmentLike = { id: string; file_url: string; file_type: string };

/** Ordinary attachments, as thumbnails that open the file. */
export function AttachmentsCard({ attachments }: { attachments: AttachmentLike[] }) {
  if (attachments.length === 0) return null;
  return (
    <DetailCard title={`Attachments (${attachments.length})`}>
      <ul className="flex flex-wrap gap-3">
        {attachments.map((a) => {
          const filename = fileNameOf(a.file_url);
          const isImage = a.file_type === "image";
          const Icon = a.file_type === "video" ? Film : a.file_type === "pdf" ? FileText : File;
          return (
            <li key={a.id}>
              <a
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                title={filename}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isImage ? "w-20" : "w-[100px]",
                )}
              >
                <span
                  className={cn(
                    "flex h-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted",
                    isImage ? "w-20" : "w-[100px]",
                  )}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.file_url} alt={filename} className="size-full object-cover" />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      className={cn("size-7", a.file_type === "video" ? "text-primary" : a.file_type === "pdf" ? "text-destructive" : "text-muted-foreground")}
                    />
                  )}
                </span>
                <span className="max-w-[100px] text-center text-[0.7rem] leading-tight break-all text-muted-foreground">
                  {filename.length > 20 ? filename.slice(0, 17) + "..." : filename}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </DetailCard>
  );
}

export type HistoryEvent = {
  id: string;
  variant: string;
  isPaused: boolean;
  text: string;
  userName: string;
  date: Date;
};

/** The tone of one history entry — same colours the pages used, as tones. */
function historyTone(event: HistoryEvent): StatusTone {
  if (event.isPaused) return "amber";
  switch (event.variant) {
    case "on_progress":
      return "blue";
    case "waiting":
      return "amber";
    case "cancelled":
    case "rejected":
      return "red";
    case "done":
    case "ready_for_pickup":
    case "waiting_pickup":
    case "handed_to_courier":
    case "delivered":
    case "completed":
      return "green";
    default:
      return "gray";
  }
}

/** Status changes and pauses, newest first. */
export function StatusHistoryCard({
  events,
  technicianId,
}: {
  events: HistoryEvent[];
  technicianId: string | null;
}) {
  return (
    <DetailCard title="Status History">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No status changes yet</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className={cn("flex flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-foreground", TONE_CLASSES[historyTone(event)])}
            >
              <Badge variant={event.variant} technicianId={technicianId} isPaused={event.isPaused} />
              <span className="text-[0.8125rem] font-medium text-foreground">{event.text}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                {event.userName} • {formatDateTime(event.date)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </DetailCard>
  );
}

const PROOF_META: Record<ProofKind, { label: string; Icon: LucideIcon; tone: StatusTone }> = {
  "work-proof": { label: "Work Completion", Icon: CheckCircle2, tone: "green" },
  "courier-proof": { label: "Courier Handover", Icon: Truck, tone: "violet" },
  "pickup-proof": { label: "Pickup Handover", Icon: Handshake, tone: "blue" },
  "delivery-proof": { label: "Delivery Confirmed", Icon: MailCheck, tone: "green" },
  "cancel-proof": { label: "Cancellation", Icon: XCircle, tone: "red" },
};

/** Files uploaded as proof with a status change, labelled by what they prove. */
export function ProofAttachmentsCard({ attachments }: { attachments: AttachmentLike[] }) {
  if (attachments.length === 0) return null;
  return (
    <DetailCard title="Proof Attachments">
      <ul className="flex flex-col gap-3">
        {attachments.map((a) => {
          const meta = PROOF_META[proofKindOf(a.file_url) ?? "work-proof"];
          const filename = fileNameOf(a.file_url);
          const FileIcon = a.file_type === "video" ? Film : FileText;
          return (
            <li key={a.id}>
              <a
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 rounded-[0.625rem] border px-3 py-2.5 outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
                  TONE_CLASSES[meta.tone],
                )}
              >
                <span className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5">
                  {a.file_type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.file_url} alt={filename} className="size-full object-cover" />
                  ) : (
                    <FileIcon aria-hidden="true" className="size-[22px]" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-current/15 px-2 py-0.5 text-[0.68rem] font-bold tracking-wide">
                    <meta.Icon aria-hidden="true" className="size-3" /> {meta.label}
                  </span>
                  <span className="w-full truncate text-[0.78rem] text-muted-foreground">
                    {filename.length > 36 ? filename.slice(0, 33) + "..." : filename}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </DetailCard>
  );
}
