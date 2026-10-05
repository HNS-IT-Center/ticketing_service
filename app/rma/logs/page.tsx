import Link from "next/link";
import { requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { rmaStatusMeta } from "@/components/rma/RmaStatusCard";
import { formatTimeOfDay } from "@/lib/rma/log-grouping";
import {
  CASES_PER_PAGE,
  EVENTS_PER_PAGE,
  LOG_FILTER_STATUSES,
  getRmaLogCases,
  getRmaLogEvents,
  hasAnyFilter,
  isRmaLogView,
  type RmaLogFilters,
  type RmaLogView,
} from "@/lib/rma/logs";
import { History, Search, ArrowRight, ChevronDown, Clock } from "lucide-react";
import type { Role } from "@prisma/client";

export const metadata = { title: "Log Aktivitas RMA — HNS IT Center" };

/** Who did it, coloured by role so the desk and the workshop read apart. */
const ROLE_TONES: Partial<Record<Role, { bg: string; fg: string; border: string }>> = {
  Technician: { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  RMA: { bg: "#ede9fe", fg: "#5b21b6", border: "#ddd6fe" },
};
const ROLE_FALLBACK = { bg: "var(--cream)", fg: "var(--text-secondary)", border: "var(--border)" };

function RoleChip({ role }: { role: Role }) {
  const tone = ROLE_TONES[role] ?? ROLE_FALLBACK;
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        borderRadius: "5px",
        padding: "1px 6px",
        fontSize: "0.6875rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {role}
    </span>
  );
}

function StatusPill({ status, small }: { status: Parameters<typeof rmaStatusMeta>[0]; small?: boolean }) {
  const { label, colors, Icon } = rmaStatusMeta(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        borderRadius: "999px",
        padding: small ? "0.1rem 0.5rem" : "0.2rem 0.7rem",
        fontSize: small ? "0.6875rem" : "0.75rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={small ? 11 : 13} />
      {label}
    </span>
  );
}

/**
 * Nothing to show — and, when the reader has walked past the last page, a way
 * back. The pagination strip hides itself once there is only one page, so
 * without this a stale `?page=` left the reader on a dead end that read
 * "Belum ada aktivitas RMA" although the log was full.
 */
function EmptyState({
  page,
  lastPage,
  href,
  message,
}: {
  page: number;
  lastPage: number;
  href: string;
  message: string;
}) {
  const pastTheEnd = page > lastPage;
  return (
    <div className="card">
      <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
        {pastTheEnd
          ? `Halaman ${page} kosong — isinya berakhir di halaman ${lastPage}.`
          : message}
      </p>
      {pastTheEnd && (
        <Link href={href} className="btn btn-outline" style={{ marginTop: "0.75rem" }}>
          Kembali ke halaman 1
        </Link>
      )}
    </div>
  );
}

export default async function RmaLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    view?: string;
  }>;
}) {
  await requireRole("RMA", "Administrator");
  const params = await searchParams;

  const filters: RmaLogFilters = {
    q: (params.q || "").trim(),
    status: params.status || "",
    from: params.from || "",
    to: params.to || "",
  };
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const view: RmaLogView = isRmaLogView(params.view) ? params.view : "case";
  const filtered = hasAnyFilter(filters);

  const grouped = view === "case" ? await getRmaLogCases(filters, page) : null;
  const chronological = view === "time" ? await getRmaLogEvents(filters, page) : null;

  const total = grouped?.total ?? chronological?.total ?? 0;
  const lastPage = grouped?.lastPage ?? chronological?.lastPage ?? 1;

  /** Keeps the filters when only the page or the view changes. */
  const hrefWith = (over: { view?: RmaLogView; page?: number }) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.status) sp.set("status", filters.status);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);

    const nextView = over.view ?? view;
    if (nextView !== "case") sp.set("view", nextView);

    // Switching view starts again at page one: page 3 of cases is not page 3
    // of events, and the two are not even counted in the same unit.
    const nextPage = over.page ?? (over.view ? 1 : page);
    if (nextPage > 1) sp.set("page", String(nextPage));

    const qs = sp.toString();
    return qs ? `/rma/logs?${qs}` : "/rma/logs";
  };

  const tabStyle = (active: boolean) => ({
    minHeight: "38px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 1rem",
    borderRadius: "8px",
    border: `1px solid ${active ? "var(--border-brand)" : "transparent"}`,
    background: active ? "var(--white)" : "transparent",
    color: active ? "var(--primary-brand)" : "var(--text-secondary)",
    fontSize: "0.84375rem",
    fontWeight: 700,
    textDecoration: "none",
    boxShadow: active ? "0 1px 2px rgba(22,70,157,0.12)" : "none",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem" }}>Log Aktivitas RMA</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Riwayat perpindahan status setiap case klaim. Dikelompokkan per case, jadi satu case
          bisa dibaca utuh dalam satu blok.
        </p>
      </div>

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <form
        className="card"
        method="get"
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        {/* The view survives a filter submit; without it every search would
            bounce the reader back to the grouped view. */}
        <input type="hidden" name="view" value={view} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Cari</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Kode RMA, tiket, nama, atau isi catatan"
              className="form-input"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Tahapan tujuan</span>
            <select name="status" defaultValue={filters.status} className="form-input">
              <option value="">Semua tahapan</option>
              {LOG_FILTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {rmaStatusMeta(s).label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Dari tanggal</span>
            <input type="date" name="from" defaultValue={filters.from} className="form-input" />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Sampai tanggal</span>
            <input type="date" name="to" defaultValue={filters.to} className="form-input" />
          </label>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Search size={15} /> Terapkan
            </button>
            {filtered && (
              <Link href={hrefWith({ page: 1 })} className="btn btn-outline">
                Reset
              </Link>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px dashed var(--border-light)",
            paddingTop: "0.9rem",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {view === "case"
              ? `${total} case cocok${filtered ? " dengan filter" : ""}`
              : `${total} kejadian${filtered ? " cocok dengan filter" : ""}`}
          </span>

          <div
            role="group"
            aria-label="Cara menampilkan log"
            style={{
              display: "inline-flex",
              background: "var(--cream)",
              border: "1px solid var(--border-brand)",
              borderRadius: "10px",
              padding: "3px",
            }}
          >
            <Link href={hrefWith({ view: "case" })} style={tabStyle(view === "case")}>
              Per Case
            </Link>
            <Link href={hrefWith({ view: "time" })} style={tabStyle(view === "time")}>
              Kronologis
            </Link>
          </div>
        </div>
      </form>

      {/* ══ Per case ═══════════════════════════════════════════════════ */}
      {grouped &&
        (grouped.cases.length === 0 ? (
          <EmptyState
            page={page}
            lastPage={grouped.lastPage}
            href={hrefWith({ page: 1 })}
            message={
              filtered ? "Tidak ada case yang cocok dengan filter ini." : "Belum ada aktivitas RMA."
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {grouped.cases.map((c, index) => (
              <details
                key={c.id}
                /* The newest few open, so the page says something before any
                   clicking; the rest stay shut so it can still be scanned. */
                open={index < 3}
                className="card rma-log-case"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <summary
                  className="rma-log-summary"
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    padding: "1rem 1.125rem",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        flexWrap: "wrap",
                        minWidth: 0,
                      }}
                    >
                      <StatusPill status={c.status} />
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.90625rem",
                          fontWeight: 700,
                        }}
                      >
                        {c.rma_code}
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                        #{c.ticket.ticket_code}
                      </span>
                      {c.ticket.store_location && (
                        <span
                          style={{
                            background: "var(--cream)",
                            border: "1px solid var(--border-brand)",
                            borderRadius: "6px",
                            padding: "0.1rem 0.4rem",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {c.ticket.store_location.code}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                        {c.totalEvents} kejadian
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          background: "var(--cream)",
                          border: "1px solid var(--border-brand)",
                          borderRadius: "999px",
                          padding: "0.1rem 0.6rem",
                          fontSize: "0.71875rem",
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Clock size={11} />
                        {c.stageAge}
                      </span>
                      <ChevronDown
                        size={18}
                        className="rma-log-chevron"
                        style={{ color: "var(--text-muted)", flexShrink: 0 }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "0.45rem",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.2rem 0.9rem",
                    }}
                  >
                    {c.ticket.customer_name && <span>{c.ticket.customer_name}</span>}
                    {c.ticket.device_name && <span>{c.ticket.device_name}</span>}
                    {c.ticket.device_sn && <span>SN {c.ticket.device_sn}</span>}
                    <span>PIC {c.handler?.name ?? "belum ada"}</span>
                    {c.ticket.technician && <span>Teknisi {c.ticket.technician.name}</span>}
                  </div>

                  {/* Only worth saying when the filter picked out part of the
                      case: the rest of the timeline below it did not match. */}
                  {filtered && c.matchedEvents < c.totalEvents && (
                    <div
                      style={{
                        marginTop: "0.45rem",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      Filter cocok pada {c.matchedEvents} dari {c.totalEvents} kejadian — riwayat
                      lengkapnya tetap ditampilkan.
                    </div>
                  )}
                </summary>

                <div style={{ borderTop: "1px solid var(--border-light)", padding: "1rem 1.125rem 1.125rem" }}>
                  <Link
                    href={`/rma/cases/${c.id}`}
                    className="btn btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      marginBottom: "1rem",
                    }}
                  >
                    Buka halaman case
                    <ArrowRight size={15} />
                  </Link>

                  <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {c.events.map((e) => {
                      const to = rmaStatusMeta(e.to_status);
                      const from = e.from_status ? rmaStatusMeta(e.from_status) : null;
                      const Icon = to.Icon;

                      return (
                        <li key={e.id} style={{ display: "flex", gap: "0.875rem", position: "relative" }}>
                          <div
                            style={{
                              position: "relative",
                              width: "30px",
                              flexShrink: 0,
                              display: "flex",
                              justifyContent: "center",
                            }}
                          >
                            {!e.isLast && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "30px",
                                  bottom: 0,
                                  left: "14px",
                                  width: "2px",
                                  background: "var(--border-light)",
                                }}
                              />
                            )}
                            <span
                              style={{
                                width: "30px",
                                height: "30px",
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
                              <Icon size={14} />
                            </span>
                          </div>

                          <div
                            style={{
                              minWidth: 0,
                              flex: 1,
                              paddingBottom: e.isLast ? 0 : "1.125rem",
                              paddingTop: "0.2rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.35rem 0.65rem",
                                alignItems: "baseline",
                                justifyContent: "space-between",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "0.4rem",
                                  alignItems: "center",
                                  minWidth: 0,
                                }}
                              >
                                {from && (
                                  <>
                                    <span style={{ fontSize: "0.84375rem", color: "var(--text-muted)" }}>
                                      {from.label}
                                    </span>
                                    <ArrowRight
                                      size={13}
                                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                                    />
                                  </>
                                )}
                                <strong style={{ fontSize: "0.90625rem" }}>{to.label}</strong>
                              </span>
                              <span
                                style={{
                                  fontSize: "0.78125rem",
                                  color: "var(--text-muted)",
                                  fontFamily: "ui-monospace, monospace",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatDateTime(e.created_at)}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop: "0.25rem",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.4rem",
                                alignItems: "center",
                              }}
                            >
                              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                {e.actor.name}
                              </span>
                              <RoleChip role={e.actor.role} />
                              {e.gap && (
                                <span
                                  style={{
                                    fontSize: "0.71875rem",
                                    color: "var(--text-muted)",
                                    background: "var(--cream)",
                                    border: "1px solid var(--border-light)",
                                    borderRadius: "999px",
                                    padding: "0.1rem 0.5rem",
                                    fontFamily: "ui-monospace, monospace",
                                  }}
                                >
                                  +{e.gap} dari langkah sebelumnya
                                </span>
                              )}
                            </div>

                            {e.note ? (
                              <p
                                style={{
                                  margin: "0.55rem 0 0",
                                  padding: "0.55rem 0.75rem",
                                  borderLeft: "3px solid var(--primary-brand)",
                                  background: "var(--cream)",
                                  borderRadius: "0 8px 8px 0",
                                  fontSize: "0.84375rem",
                                  color: "var(--text-primary)",
                                  wordBreak: "break-word",
                                  whiteSpace: "pre-line",
                                }}
                              >
                                {e.note}
                              </p>
                            ) : (
                              <p
                                style={{
                                  margin: "0.4rem 0 0",
                                  fontSize: "0.78125rem",
                                  color: "var(--text-muted)",
                                  fontStyle: "italic",
                                }}
                              >
                                Tanpa catatan
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        ))}

      {/* ══ Kronologis ═════════════════════════════════════════════════ */}
      {chronological &&
        (chronological.days.length === 0 ? (
          <EmptyState
            page={page}
            lastPage={chronological.lastPage}
            href={hrefWith({ page: 1 })}
            message={
              filtered
                ? "Tidak ada aktivitas yang cocok dengan filter ini."
                : "Belum ada aktivitas RMA."
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {chronological.days.map((day) => (
              <div key={day.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.75rem 1.125rem",
                    background: "var(--cream)",
                    borderBottom: "1px solid var(--border-brand)",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 800 }}>{day.label}</h2>
                  <span style={{ fontSize: "0.78125rem", color: "var(--text-muted)" }}>
                    {day.items.length} kejadian · {day.caseCount} case
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.8125rem",
                      minWidth: "860px",
                    }}
                  >
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                        {[
                          ["Jam", "72px"],
                          ["Case", "190px"],
                          ["Perpindahan", "300px"],
                          ["Oleh", "160px"],
                          ["Catatan", "auto"],
                        ].map(([label, width]) => (
                          <th
                            key={label}
                            style={{
                              padding: "0.55rem 0.75rem",
                              fontWeight: 700,
                              fontSize: "0.6875rem",
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              borderBottom: "1px solid var(--border-light)",
                              width,
                            }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {day.items.map((e, i) => (
                        <tr
                          key={e.id}
                          style={{
                            borderTop: "1px solid var(--border-light)",
                            background: i % 2 ? "var(--cream)" : "transparent",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.7rem 0.75rem",
                              verticalAlign: "top",
                              fontFamily: "ui-monospace, monospace",
                              color: "var(--text-secondary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatTimeOfDay(e.created_at)}
                          </td>
                          <td style={{ padding: "0.7rem 0.75rem", verticalAlign: "top" }}>
                            <Link
                              href={`/rma/cases/${e.rma_case.id}`}
                              style={{
                                display: "block",
                                fontFamily: "ui-monospace, monospace",
                                fontWeight: 700,
                                fontSize: "0.78125rem",
                              }}
                            >
                              {e.rma_case.rma_code}
                            </Link>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              #{e.rma_case.ticket.ticket_code}
                              {e.rma_case.ticket.customer_name
                                ? ` · ${e.rma_case.ticket.customer_name}`
                                : ""}
                            </span>
                          </td>
                          <td style={{ padding: "0.7rem 0.75rem", verticalAlign: "top" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "var(--text-muted)", fontSize: "0.78125rem" }}>
                                {e.from_status
                                  ? rmaStatusMeta(e.from_status).label
                                  : "Serah terima"}
                              </span>
                              <span style={{ color: "var(--text-muted)" }}>→</span>
                              <StatusPill status={e.to_status} small />
                            </span>
                          </td>
                          <td style={{ padding: "0.7rem 0.75rem", verticalAlign: "top" }}>
                            <span style={{ display: "block", fontSize: "0.78125rem" }}>
                              {e.actor.name}
                            </span>
                            <RoleChip role={e.actor.role} />
                          </td>
                          <td
                            style={{
                              padding: "0.7rem 0.75rem",
                              verticalAlign: "top",
                              color: "var(--text-secondary)",
                              wordBreak: "break-word",
                              whiteSpace: "pre-line",
                            }}
                          >
                            {e.note || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* ── Halaman ─────────────────────────────────────────────────────── */}
      {lastPage > 1 && (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {page > 1 ? (
            <Link href={hrefWith({ page: page - 1 })} className="btn btn-outline">
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Halaman {page} dari {lastPage} ·{" "}
            {view === "case" ? `${CASES_PER_PAGE} case` : `${EVENTS_PER_PAGE} kejadian`} per halaman
          </span>
          {page < lastPage ? (
            <Link href={hrefWith({ page: page + 1 })} className="btn btn-outline">
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          fontSize: "0.78125rem",
          color: "var(--text-muted)",
          margin: 0,
        }}
      >
        <History size={14} />
        Setiap baris adalah satu perpindahan status yang dicatat sistem. Tidak bisa diubah atau
        dihapus dari aplikasi.
      </p>
    </div>
  );
}
