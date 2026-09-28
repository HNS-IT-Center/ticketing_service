import Link from "next/link";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { rmaStatusMeta } from "@/components/rma/RmaStatusCard";
import { History, Search, ArrowRight } from "lucide-react";
import type { Prisma, RmaStatus } from "@prisma/client";

export const metadata = { title: "Log Aktivitas RMA — HNS IT Center" };

const PAGE_SIZE = 25;

/** Stages offered in the filter, in the order the desk works them. */
const FILTER_STATUSES: RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "closed",
  "cancelled",
];

export default async function RmaLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; date?: string; page?: string }>;
}) {
  await requireRole("RMA", "Administrator");
  const params = await searchParams;

  const q = (params.q || "").trim();
  const status = params.status || "";
  const date = params.date || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where: Prisma.RmaEventWhereInput = {};

  if (q) {
    where.OR = [
      { rma_case: { rma_code: { contains: q } } },
      { rma_case: { ticket: { ticket_code: { contains: q } } } },
      { actor: { name: { contains: q } } },
    ];
  }

  if (status && (FILTER_STATUSES as string[]).includes(status)) {
    where.to_status = status as RmaStatus;
  }

  if (date) {
    // One calendar day, local time, half-open so the last second is included.
    const from = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(from.getTime())) {
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      where.created_at = { gte: from, lt: to };
    }
  }

  const [events, total] = await Promise.all([
    db.rmaEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        from_status: true,
        to_status: true,
        note: true,
        created_at: true,
        actor: { select: { name: true, role: true } },
        rma_case: {
          select: {
            id: true,
            rma_code: true,
            ticket: { select: { ticket_code: true, customer_name: true } },
          },
        },
      },
    }),
    db.rmaEvent.count({ where }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || status || date);

  /** Keeps the current filters when only the page changes. */
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (date) sp.set("date", date);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/rma/logs?${qs}` : "/rma/logs";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem" }}>Log Aktivitas RMA</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Setiap perpindahan status dari semua case, terbaru di atas.
        </p>
      </div>

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <form
        className="card"
        method="get"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "0.75rem",
          alignItems: "end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Cari</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Kode RMA, kode tiket, atau nama"
            className="form-input"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Status tujuan</span>
          <select name="status" defaultValue={status} className="form-input">
            <option value="">Semua status</option>
            {FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {rmaStatusMeta(s).label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Tanggal</span>
          <input type="date" name="date" defaultValue={date} className="form-input" />
        </label>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Search size={15} /> Terapkan
          </button>
          {hasFilters && (
            <Link href="/rma/logs" className="btn btn-outline">
              Reset
            </Link>
          )}
        </div>
      </form>

      {/* ── Daftar ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <History size={16} style={{ color: "var(--text-muted)" }} />
            <h3 style={{ margin: 0 }}>Aktivitas</h3>
          </div>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {total} kejadian{hasFilters ? " (terfilter)" : ""}
          </span>
        </div>

        {events.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
            {hasFilters
              ? "Tidak ada aktivitas yang cocok dengan filter ini."
              : "Belum ada aktivitas RMA."}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {events.map((event) => {
              const to = rmaStatusMeta(event.to_status);
              const from = event.from_status ? rmaStatusMeta(event.from_status) : null;
              const Icon = to.Icon;

              return (
                <li key={event.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Link
                    href={`/rma/cases/${event.rma_case.id}`}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      padding: "0.85rem 0",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        width: "1.75rem",
                        height: "1.75rem",
                        borderRadius: "50%",
                        background: to.colors.bg,
                        color: to.colors.fg,
                        border: `1px solid ${to.colors.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={13} />
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          flexWrap: "wrap",
                          fontSize: "0.875rem",
                        }}
                      >
                        {from && (
                          <>
                            <span style={{ color: "var(--text-muted)" }}>{from.label}</span>
                            <ArrowRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          </>
                        )}
                        <strong>{to.label}</strong>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.2rem 0.75rem",
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                          marginTop: "0.15rem",
                        }}
                      >
                        <span style={{ fontFamily: "ui-monospace, monospace" }}>
                          {event.rma_case.rma_code}
                        </span>
                        <span>#{event.rma_case.ticket.ticket_code}</span>
                        {event.rma_case.ticket.customer_name && (
                          <span>{event.rma_case.ticket.customer_name}</span>
                        )}
                        <span>oleh {event.actor.name}</span>
                      </div>

                      {event.note && (
                        <p
                          style={{
                            margin: "0.4rem 0 0",
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary)",
                            background: "var(--cream)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "0.35rem 0.6rem",
                            wordBreak: "break-word",
                          }}
                        >
                          {event.note}
                        </p>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {formatDateTime(event.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {lastPage > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              borderTop: "1px solid var(--border)",
              paddingTop: "1rem",
              marginTop: "1rem",
            }}
          >
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn btn-outline">
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Halaman {page} dari {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={pageHref(page + 1)} className="btn btn-outline">
                Berikutnya →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
