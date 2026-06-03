"use client";

import { useState, useTransition } from "react";
import TakeTicketButton from "./TakeTicketButton";
import { CheckCircle, ArrowUp, ArrowDown, Clock, XCircle, Lock } from "lucide-react";
import { cancelTicketRequestAction } from "@/app/actions/technician";
import toast from "react-hot-toast";

type UnassignedTicket = {
  id: string;
  ticket_code: string;
  ticket_type: string;
  device_type: string;
  created_at: Date;
  user: { name: string };
};

type SortType = "asc" | "desc" | "default";

function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export default function AvailableTickets({
  tickets,
  myRequestedIds = [],
  otherRequestedIds = [],
}: {
  tickets: UnassignedTicket[];
  myRequestedIds?: string[];
  otherRequestedIds?: string[];
}) {
  const [sort, setSort] = useState<SortType>("default");
  // Optimistic cancellation: IDs removed from "mine" set locally
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const mySet    = new Set(myRequestedIds.filter((id) => !cancelledIds.has(id)));
  const otherSet = new Set(otherRequestedIds);

  const sortedTickets = [...tickets].sort((a, b) => {
    if (sort === "asc")  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === "desc") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const toggleSort = () =>
    setSort((prev) => (prev === "default" ? "asc" : prev === "asc" ? "desc" : "default"));

  const handleCancel = (ticketId: string) => {
    startTransition(async () => {
      const result = await cancelTicketRequestAction(ticketId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setCancelledIds((prev) => new Set([...prev, ticketId]));
        toast.success("Request cancelled.");
      }
    });
  };

  if (tickets.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "2rem" }}>
        <CheckCircle size={32} style={{ opacity: 0.3 }} />
        <p>No unassigned tickets at the moment</p>
      </div>
    );
  }

  // ── Action cell: 3 states ──────────────────────────────────────────────────
  const ActionCell = ({ ticket }: { ticket: UnassignedTicket }) => {
    const isMine  = mySet.has(ticket.id);
    const isOther = !isMine && otherSet.has(ticket.id);

    if (isOther) {
      return (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "0.3rem",
          padding: "0.25rem 0.6rem", borderRadius: "999px",
          background: "rgba(107,114,128,0.08)", color: "#6b7280",
          fontSize: "0.75rem", fontWeight: 600,
          border: "1px solid rgba(107,114,128,0.2)",
          whiteSpace: "nowrap",
        }}>
          <Lock size={11} /> Requested by other
        </span>
      );
    }

    if (isMine) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            padding: "0.25rem 0.6rem", borderRadius: "999px",
            background: "rgba(234,179,8,0.1)", color: "#a16207",
            fontSize: "0.75rem", fontWeight: 700,
            border: "1px solid rgba(234,179,8,0.3)",
            whiteSpace: "nowrap",
          }}>
            <Clock size={11} /> Requested
          </span>
          <button
            onClick={() => handleCancel(ticket.id)}
            disabled={isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.25rem",
              padding: "0.2rem 0.5rem", borderRadius: "var(--radius-md)",
              background: "none", color: "#dc2626",
              border: "1px solid rgba(220,38,38,0.3)",
              fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
              opacity: isPending ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            <XCircle size={11} /> Cancel
          </button>
        </div>
      );
    }

    return <TakeTicketButton ticketId={ticket.id} />;
  };

  const rowStyle = (ticket: UnassignedTicket): React.CSSProperties => {
    const isOther = !mySet.has(ticket.id) && otherSet.has(ticket.id);
    const isMine  = mySet.has(ticket.id);
    return {
      opacity: isOther ? 0.6 : isMine ? 0.8 : 1,
      background: isOther
        ? "rgba(107,114,128,0.04)"
        : isMine
        ? "rgba(234,179,8,0.04)"
        : undefined,
      transition: "all 0.2s",
    };
  };

  const cardBorder = (ticket: UnassignedTicket): React.CSSProperties => {
    const isOther = !mySet.has(ticket.id) && otherSet.has(ticket.id);
    const isMine  = mySet.has(ticket.id);
    return {
      border: isOther
        ? "1.5px solid rgba(107,114,128,0.2)"
        : isMine
        ? "1.5px solid rgba(234,179,8,0.25)"
        : undefined,
    };
  };

  return (
    <>
      {/* Desktop table */}
      <div className="admin-ticket-table">
        <div className="table-wrapper border-none" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Ticket Code</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Device</th>
                <th
                  onClick={toggleSort}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Sort by date"
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sort === "asc" ? (
                      <ArrowUp size={14} />
                    ) : (
                      <ArrowDown size={14} style={{ opacity: sort === "desc" ? 1 : 0.5 }} />
                    )}
                  </div>
                </th>
                <th>Points</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((t) => (
                <tr key={t.id} style={rowStyle(t)}>
                  <td className="font-mono font-semibold text-primary">{t.ticket_code}</td>
                  <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                  <td>{t.user?.name || "Guest"}</td>
                  <td className="text-muted-foreground">{t.device_type.replace(/_/g, " ")}</td>
                  <td className="text-muted-foreground" style={{ fontSize: "0.85rem" }}>
                    {new Date(t.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td>
                    <span className="badge badge-technician">
                      {getTicketPoints(t.ticket_type, t.device_type)} pts
                    </span>
                  </td>
                  <td>
                    <ActionCell ticket={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="admin-ticket-cards">
        {sortedTickets.map((t) => {
          const pts = getTicketPoints(t.ticket_type, t.device_type);
          return (
            <div
              key={t.id}
              className="mobile-ticket-card"
              style={{ ...rowStyle(t), ...cardBorder(t) }}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-primary">{t.ticket_code}</span>
                <span className="badge badge-technician">{pts} pts</span>
              </div>
              <div className="flex justify-between text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
                <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                <span>{t.user?.name || "Guest"}</span>
              </div>
              <div className="flex justify-between text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
                <span>{t.device_type.replace(/_/g, " ")}</span>
                <span>{new Date(t.created_at).toLocaleDateString("id-ID")}</span>
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <ActionCell ticket={t} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
