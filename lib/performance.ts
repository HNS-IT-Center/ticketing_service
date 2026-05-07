import { db } from "@/lib/db";

function getTicketPoints(type: string): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

export async function getTopTechnicianOfMonth(month: number, year: number): Promise<string | null> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const doneTickets = await db.ticket.findMany({
    where: {
      status: "done",
      technician_id: { not: null },
      status_logs: {
        some: { new_status: "done", created_at: { gte: startDate, lt: endDate } },
      },
    },
    select: { ticket_type: true, technician_id: true },
  });

  const pointsMap = new Map<string, number>();
  for (const t of doneTickets) {
    if (!t.technician_id) continue;
    const pts = getTicketPoints(t.ticket_type);
    pointsMap.set(t.technician_id, (pointsMap.get(t.technician_id) || 0) + pts);
  }

  let topId: string | null = null;
  let maxPts = -1;
  for (const [techId, pts] of pointsMap.entries()) {
    if (pts > maxPts) {
      maxPts = pts;
      topId = techId;
    }
  }
  return topId;
}
