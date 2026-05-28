"use client";

import { useState } from "react";
import Link from "next/link";
import TakeTicketButton from "./TakeTicketButton";
import { CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type UnassignedTicket = {
  id: string;
  ticket_code: string;
  ticket_type: string;
  device_type: string;
  created_at: Date;
  user: { name: string };
};

type SortType = "asc" | "desc" | "default";

function getTicketPoints(type: string) {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

export default function AvailableTickets({
  tickets,
}: {
  tickets: UnassignedTicket[];
}) {
  const [sort, setSort] = useState<SortType>("default");

  const sortedTickets = [...tickets].sort((a, b) => {
    if (sort === "asc") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sort === "desc") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // default (newest first, already descended from db or handled here)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const toggleSort = () => {
    setSort((prev) => (prev === "default" ? "asc" : prev === "asc" ? "desc" : "default"));
  };

  if (tickets.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "2rem" }}>
        <CheckCircle size={32} style={{ opacity: 0.3 }} />
        <p>No unassigned tickets at the moment</p>
      </div>
    );
  }

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
                  title="Click to sort"
                >
                  <div  className="flex items-center gap-1">
                    Date
                    {sort === "default" ? (
                      <ArrowDown size={14} style={{ opacity: 0.5 }} />
                    ) : sort === "asc" ? (
                      <ArrowUp size={14} />
                    ) : (
                      <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th>Points</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((t) => (
                <tr key={t.id}>
                  <td  className="font-mono font-semibold text-primary">{t.ticket_code}</td>
                  <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                  <td>{t.user?.name || "Guest"}</td>
                  <td  className="text-muted-foreground">{t.device_type.replace(/_/g, " ")}</td>
                  <td  className="text-muted-foreground" style={{ fontSize: "0.85rem" }}>
                    {new Date(t.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td><span className="badge badge-technician">{getTicketPoints(t.ticket_type)} pts</span></td>
                  <td>
                    <TakeTicketButton ticketId={t.id} />
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
          const pts = getTicketPoints(t.ticket_type);
          return (
            <div key={t.id} className="mobile-ticket-card">
              <div  className="flex justify-between items-center">
                <span  className="font-mono font-bold text-primary">{t.ticket_code}</span>
                <span className="badge badge-technician">{pts} pts</span>
              </div>
              <div  className="flex justify-between text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
                <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                <span>{t.user?.name || "Guest"}</span>
              </div>
              <div  className="flex justify-between text-muted-foreground mt-1" style={{ fontSize: "0.8125rem" }}>
                <span>{t.device_type.replace(/_/g, " ")}</span>
                <span>{new Date(t.created_at).toLocaleDateString("id-ID")}</span>
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <TakeTicketButton ticketId={t.id} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
