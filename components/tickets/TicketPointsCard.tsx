import { Star } from "lucide-react";
import { db } from "@/lib/db";
import { EARNING_TRANSITION_FILTER } from "@/lib/kpi";
import { JOB_POINT_CHARGES, ticketTotalPoints } from "@/lib/points";
import { formatDateTime } from "@/lib/utils";
import { DetailCard } from "@/components/tickets/TicketSections";
import { TicketPointsControl } from "@/components/tickets/TicketPointsControl";

const nf = new Intl.NumberFormat("id-ID");

/**
 * What the ticket earns its technician, and the administrator's switch to take
 * that off. Loads its own figures so the ticket page's big query stays as it is.
 */
export async function TicketPointsCard({ ticketId }: { ticketId: string }) {
  const [ticket, earned] = await Promise.all([
    db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticket_code: true,
        ticket_type: true,
        device_type: true,
        technician: { select: { name: true } },
        cleaning_detail: { select: { service_package: true } },
        charges: JOB_POINT_CHARGES,
        points_excluded_at: true,
        points_excluded_by: true,
        points_excluded_reason: true,
        points_excluded_points: true,
      },
    }),
    db.ticketStatusLog.count({ where: { ticket_id: ticketId, ...EARNING_TRANSITION_FILTER } }),
  ]);
  if (!ticket) return null;
  const excluded = Boolean(ticket.points_excluded_at);
  const worth = ticketTotalPoints({ ...ticket, points_excluded_at: null });

  return (
    <DetailCard
      title={
        <span className="flex items-center gap-2">
          <Star aria-hidden="true" className="size-4" /> Poin Teknisi
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {excluded ? (
          <div className="flex flex-col gap-1 rounded-lg border border-tone-red-border bg-tone-red-bg p-3 text-tone-red-fg">
            <p className="font-semibold">Poin dihapus — tiket ini tidak dihitung</p>
            <p>
              {nf.format(ticket.points_excluded_points ?? 0)} poin dikurangi dari {ticket.technician?.name ?? "teknisi"}
              {ticket.points_excluded_by ? ` oleh ${ticket.points_excluded_by}` : ""}
              {ticket.points_excluded_at ? `, ${formatDateTime(ticket.points_excluded_at)}` : ""}.
            </p>
            {ticket.points_excluded_reason && <p>Alasan: {ticket.points_excluded_reason}</p>}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {earned > 0 ? (
              <>
                <span className="font-semibold text-foreground">{nf.format(worth)} poin</span> sudah masuk ke{" "}
                {ticket.technician?.name ?? "teknisi"}.
              </>
            ) : (
              <>
                Bernilai <span className="font-semibold text-foreground">{nf.format(worth)} poin</span> saat selesai.
              </>
            )}
          </p>
        )}
        <div>
          <TicketPointsControl ticketId={ticketId} ticketCode={ticket.ticket_code} excluded={excluded} size="sm" />
        </div>
      </div>
    </DetailCard>
  );
}
