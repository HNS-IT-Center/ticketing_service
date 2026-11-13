import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PackageSearch } from "lucide-react";
import { db } from "@/lib/db";
import { AWAITING_CODE_PART_WHERE, ticketsAwaitingPartCodeWhere } from "@/lib/part-code-alerts";
import { servicePartLabel } from "@/lib/service-parts";
import { ticketStatusDisplay } from "@/lib/status-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Rows shown; the rest are counted in the title. */
const SHOWN = 8;

/**
 * Dashboard reminder: finished service tickets with a part that still has no
 * Accurate code (rule in `lib/part-code-alerts.ts`). Renders nothing when there
 * are none, so it costs a dashboard no space on a good day.
 *
 * Server component — it loads its own list, so a dashboard only says whose
 * tickets to look at (`scope`) and where its ticket pages live (`portal`).
 */
export default async function PartCodeAlertCard({
  scope,
  portal,
  showTechnician = false,
}: {
  scope: Prisma.TicketWhereInput;
  /** `stok` is read only: Admin Stok follows it up, the technician enters the code. */
  portal: "admin" | "technician" | "stok";
  showTechnician?: boolean;
}) {
  const where = ticketsAwaitingPartCodeWhere(scope);
  const [tickets, total] = await Promise.all([
    db.ticket.findMany({
      where,
      // Longest-waiting first: the oldest is the one the cashier is stuck on.
      orderBy: { updated_at: "asc" },
      take: SHOWN,
      select: {
        id: true,
        ticket_code: true,
        status: true,
        technician_id: true,
        technician: { select: { name: true } },
        replaced_parts: {
          where: AWAITING_CODE_PART_WHERE,
          orderBy: { created_at: "asc" },
          select: { id: true, part: true, item_name: true },
        },
      },
    }),
    db.ticket.count({ where }),
  ]);

  if (total === 0) return null;

  return (
    <Alert variant="warning">
      <PackageSearch aria-hidden="true" />
      <AlertTitle className="font-semibold">
        {total} tiket selesai, part belum punya kode Accurate
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {portal === "stok" ? (
          <p>
            Servisnya sudah selesai, tapi part yang dipasang masih tercatat dengan nama saja. Pastikan barangnya sudah
            diterima di Accurate, lalu ingatkan teknisinya untuk memasukkan kode di <strong>Rincian Biaya</strong>.
            Tanpa kode itu kasir tidak bisa memasukkan fakturnya ke Accurate.
          </p>
        ) : (
          <p>
            Servisnya sudah selesai, tapi part yang dipasang masih tercatat dengan nama saja. Setelah barangnya
            diterima di Accurate, buka tiketnya → <strong>Rincian Biaya</strong> → <strong>Masukkan kode</strong>,
            lalu pilih sparepart yang benar-benar dipakai. Tanpa kode itu kasir tidak bisa memasukkan fakturnya ke
            Accurate.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-tone-amber-border bg-card px-3 py-2 text-foreground"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{t.ticket_code}</span>
                  <span className="text-xs text-muted-foreground">
                    {ticketStatusDisplay(t.status, { hasTechnician: Boolean(t.technician_id) }).label}
                    {showTechnician && ` · ${t.technician?.name ?? "Tanpa teknisi"}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.replaced_parts
                    .map((p) => (p.item_name ? `${servicePartLabel(p.part)}: ${p.item_name}` : servicePartLabel(p.part)))
                    .join(" · ")}
                </span>
              </span>
              <Link
                href={portal === "stok" ? `/stok/tickets/${t.id}` : `/${portal}/tickets/${t.id}#rincian-biaya`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary no-underline hover:underline md:min-h-0"
              >
                {portal === "stok" ? "Lihat tiket →" : "Masukkan kode →"}
              </Link>
            </li>
          ))}
        </ul>
        {total > tickets.length && (
          <p className="text-xs">
            {total - tickets.length} tiket lain belum ditampilkan — yang paling lama menunggu ada di atas.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
