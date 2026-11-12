"use client";

import { useState, useTransition } from "react";
import TakeTicketButton from "./TakeTicketButton";
import { CheckCircle, ArrowUp, ArrowDown, Clock, XCircle, Lock } from "lucide-react";
import { cancelTicketRequestAction } from "@/app/actions/technician";
import toast from "react-hot-toast";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PointsBadge } from "@/components/app/PointsBadge";
import { Button } from "@/components/ui/button";
import { getTicketPoints } from "@/lib/points";

type UnassignedTicket = {
  id: string;
  ticket_code: string;
  ticket_type: string;
  device_type: string;
  /** For a cleaning ticket's points (lib/points.ts). */
  service_package: string | null;
  /** Daftar Jasa points already on its bill (lib/points.ts). */
  job_points: number;
  created_at: Date;
  user: { name: string };
};

type SortType = "asc" | "desc" | "default";


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
    return <EmptyState icon={CheckCircle} title="No unassigned tickets at the moment" />;
  }

  // ── Action cell: 3 states ──────────────────────────────────────────────────
  const actionCell = (ticket: UnassignedTicket) => {
    const isMine  = mySet.has(ticket.id);
    const isOther = !isMine && otherSet.has(ticket.id);

    if (isOther) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-tone-gray-border bg-tone-gray-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-tone-gray-fg">
          <Lock aria-hidden="true" className="size-3" /> Requested by other
        </span>
      );
    }

    if (isMine) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-tone-amber-border bg-tone-amber-bg px-2.5 py-1 text-xs font-bold whitespace-nowrap text-tone-amber-fg">
            <Clock aria-hidden="true" className="size-3" /> Requested
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCancel(ticket.id)}
            disabled={isPending}
            className="border-tone-red-border bg-card text-destructive hover:bg-tone-red-bg hover:text-destructive"
          >
            <XCircle aria-hidden="true" /> Cancel
          </Button>
        </div>
      );
    }

    return <TakeTicketButton ticketId={ticket.id} />;
  };

  const columns: DataTableColumn<UnassignedTicket>[] = [
    { key: "code", header: "Ticket Code", cell: (t) => <span className="font-mono font-semibold text-primary">{t.ticket_code}</span>, mobile: "title" },
    { key: "type", header: "Type", cell: (t) => <span className="capitalize">{t.ticket_type.replace("_", " ")}</span> },
    { key: "customer", header: "Customer", cell: (t) => t.user?.name || "Guest" },
    // Desktop tables drop Device below xl so the action column stays in view
    // beside the sidebar; the phone cards still list it.
    { key: "device", header: "Device", cell: (t) => t.device_type.replace(/_/g, " "), className: "hidden text-muted-foreground xl:table-cell" },
    { key: "date", header: "Date", cell: (t) => new Date(t.created_at).toLocaleDateString("id-ID"), className: "whitespace-nowrap text-muted-foreground" },
    { key: "points", header: "Points", cell: (t) => <PointsBadge points={getTicketPoints(t.ticket_type, t.device_type, t.service_package) + t.job_points} />, mobile: "badge" },
    { key: "action", header: "", cell: actionCell, mobile: "footer" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleSort} title="Sort by date" className="text-muted-foreground">
          Date
          {sort === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" className={sort === "desc" ? undefined : "opacity-50"} />}
        </Button>
      </div>
      <DataTable
        caption="Available Tickets"
        columns={columns}
        rows={sortedTickets}
        getRowKey={(t) => t.id}
        rowClassName={(t) => {
          const isMine = mySet.has(t.id);
          const isOther = !isMine && otherSet.has(t.id);
          if (isOther) return "opacity-60 bg-muted/40";
          if (isMine) return "opacity-80 border-tone-amber-border bg-tone-amber-bg/30";
          return undefined;
        }}
      />
    </div>
  );
}
