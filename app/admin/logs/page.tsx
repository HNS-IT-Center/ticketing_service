import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { Activity, Search, Calendar } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Link from "next/link";

export const metadata = { title: "Logs — HNS IT Center" };

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; date?: string; page?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;

  const q = params.q || "";
  const status = params.status || "";
  const date = params.date || "";
  const page = parseInt(params.page || "1");
  const take = 20;
  const skip = (page - 1) * take;

  const where: any = {};

  if (q) {
    where.OR = [
      { ticket: { ticket_code: { contains: q, mode: "insensitive" } } },
      { changer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (status) {
    where.new_status = status;
  }

  if (date) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    where.created_at = { gte: startOfDay, lt: endOfDay };
  }

  const [logs, total] = await Promise.all([
    db.ticketStatusLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      take,
      skip,
      include: {
        ticket: { select: { ticket_code: true, technician_id: true } },
        changer: { select: { name: true } },
      },
    }),
    db.ticketStatusLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;

  const STATUSES = [
    "waiting",
    "on_progress",
    "done",
    "cancelled",
    "rejected",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity size={24} /> System Logs
          </h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Track all ticket status changes and activities across the platform.
          </p>
        </div>
      </div>

      <div className="card">
        <form style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <div style={{ flex: "1 1 250px", position: "relative" }}>
            <Search size={18} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search ticket code or user..."
              className="form-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>
          
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: "1 1 auto" }}>
            <select name="status" defaultValue={status} className="form-input" style={{ width: "auto" }}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>
              ))}
            </select>
            
            <div style={{ position: "relative" }}>
              <Calendar size={18} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="form-input"
                style={{ paddingLeft: "2.5rem", width: "auto" }}
              />
            </div>
            
            <button type="submit" className="btn btn-primary">Filter</button>
            {(q || status || date) && (
              <a href="/admin/logs" className="btn btn-ghost">Clear</a>
            )}
          </div>
        </form>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Ticket</th>
                <th>User (Changer)</th>
                <th>Activity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(log.created_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      <Link href={`/admin/tickets/${log.ticket_id}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                        {log.ticket.ticket_code}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 500 }}>{log.changer.name}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {log.old_status && <Badge variant={log.old_status} technicianId={log.ticket.technician_id} />}
                        {log.old_status && <span style={{ color: "var(--text-muted)" }}>→</span>}
                        <Badge variant={log.new_status} technicianId={log.ticket.technician_id} />
                      </div>
                    </td>
                    <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.reason ? (
                        <span title={log.reason}>{log.reason}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1;
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              if (status) params.set("status", status);
              if (date) params.set("date", date);
              params.set("page", p.toString());
              
              return (
                <Link
                  key={p}
                  href={`/admin/logs?${params.toString()}`}
                  className="btn btn-sm"
                  style={{
                    background: p === page ? "var(--primary)" : "var(--bg-light)",
                    color: p === page ? "#fff" : "var(--text-primary)",
                    border: p === page ? "none" : "1px solid var(--border)",
                  }}
                >
                  {p}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
