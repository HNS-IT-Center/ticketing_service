import Link from "next/link";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { EARNING_STATUS_LOG_FILTER } from "@/lib/kpi";
import { JOB_POINT_CHARGES, ticketTotalPoints } from "@/lib/points";
import { auditReasons, reasonText, tickCount, type AuditReason } from "@/lib/ticket-audit";
import { TICKET_TYPE_LABELS } from "@/lib/ticket-export";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tiket Perlu Dicek — HNS IT Center" };

/**
 * Tickets that earned points and may not be real work, per technician
 * (lib/ticket-audit.ts). Administrator only: it names staff and their numbers.
 * Read only — deciding what a flagged ticket was is a person's job.
 */
export default async function TicketAuditPage({ searchParams }: { searchParams: Promise<{ tech?: string }> }) {
  await requireRole("Administrator");
  const { tech } = await searchParams;

  const [tickets, staff] = await Promise.all([
    db.ticket.findMany({
      where: { technician_id: { not: null }, status_logs: { some: EARNING_STATUS_LOG_FILTER } },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        ticket_code: true,
        ticket_type: true,
        device_type: true,
        created_at: true,
        is_for_self: true,
        customer_name: true,
        customer_phone: true,
        device_name: true,
        extra_services: true,
        user: { select: { name: true, phone_number: true } },
        technician: { select: { id: true, name: true } },
        cleaning_detail: { select: { service_package: true } },
        charges: JOB_POINT_CHARGES,
        _count: { select: { attachments: true } },
      },
    }),
    db.user.findMany({ where: { role: { not: "Customer" } }, select: { name: true, phone_number: true } }),
  ]);

  type Flagged = (typeof tickets)[number] & { reasons: AuditReason[]; points: number };
  const perTech = new Map<string, { id: string; name: string; earned: number; flagged: number; flaggedPoints: number }>();
  const flagged: Flagged[] = [];
  for (const t of tickets) {
    if (!t.technician) continue;
    const row = perTech.get(t.technician.id) ?? { id: t.technician.id, name: t.technician.name, earned: 0, flagged: 0, flaggedPoints: 0 };
    row.earned += 1;
    // A ticket "for myself" is on the account it was opened under.
    const customer = t.is_for_self ? t.user?.name ?? null : t.customer_name;
    const phone = t.customer_phone ?? (t.is_for_self ? t.user?.phone_number ?? null : null);
    const reasons = auditReasons({ customer, customer_phone: phone, device_name: t.device_name, extra_ticks: tickCount(t.extra_services) }, staff);
    if (reasons.length > 0) {
      const points = ticketTotalPoints(t);
      row.flagged += 1;
      row.flaggedPoints += points;
      flagged.push({ ...t, reasons, points });
    }
    perTech.set(t.technician.id, row);
  }
  const summary = [...perTech.values()].sort((a, b) => b.flagged - a.flagged || a.name.localeCompare(b.name, "id"));
  const shown = tech ? flagged.filter((t) => t.technician?.id === tech) : flagged;

  return (
    <div data-slot="ticket-audit" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert aria-hidden="true" className="size-6" /> Tiket Perlu Dicek
          </span>
        }
        description="Tiket yang sudah memberi poin ke teknisi tapi datanya janggal: customer bernama sama dengan staf, nomor HP customer milik staf, nama seperti data uji, atau banyak centang Extra Services lama. Ini petunjuk untuk dicek, bukan bukti — buka tiketnya dan putuskan sendiri."
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-base font-semibold">Per teknisi</h2>
        <ul>
          {summary.map((r) => (
            <li key={r.id} className="border-t border-border first:border-t-0">
              <Link
                href={tech === r.id ? "/admin/reports/audit" : `/admin/reports/audit?tech=${r.id}`}
                className={cn("flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-inherit hover:bg-muted/60", tech === r.id && "bg-primary/5")}
              >
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-[0.8125rem]">
                  <span className="text-muted-foreground">{r.earned} tiket berpoin</span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 font-semibold",
                      r.flagged > 0 ? "border-tone-red-border bg-tone-red-bg text-tone-red-fg" : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {r.flagged} perlu dicek{r.flagged > 0 ? ` · ${r.flaggedPoints} poin` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {shown.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Tidak ada tiket yang janggal." />
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">
            {shown.length} tiket{tech ? ` · ${summary.find((s) => s.id === tech)?.name ?? ""}` : ""}
          </h2>
          <ul className="flex flex-col gap-2">
            {shown.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tickets/${t.id}`} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-inherit hover:border-primary/40">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{t.ticket_code}</span>
                    <span className="text-xs text-muted-foreground">
                      {TICKET_TYPE_LABELS[t.ticket_type]} · {t.created_at.toLocaleDateString("id-ID")} · {t.points} poin · {t._count.attachments} lampiran
                    </span>
                  </span>
                  <span className="text-[0.8125rem] text-muted-foreground">
                    {t.technician?.name} · customer {(t.is_for_self ? t.user?.name : t.customer_name) || "—"}
                    {t.device_name ? ` · ${t.device_name}` : ""}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {t.reasons.map((r) => (
                      <span key={r.kind} className="rounded-full border border-tone-amber-border bg-tone-amber-bg px-2 py-0.5 text-xs font-semibold text-tone-amber-fg">
                        {reasonText(r)}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
