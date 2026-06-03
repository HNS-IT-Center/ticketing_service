import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

// GET — list pending assignment requests (Admin/Coordinator only)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.role === "Administrator" || session.role === "Sales";
  const isCoordinator = !isAdmin && session.role === "Technician"
    ? (await db.user.findUnique({ where: { id: session.userId }, select: { is_team_leader: true } }))?.is_team_leader ?? false
    : false;

  if (!isAdmin && !isCoordinator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requests = await db.ticketAssignmentRequest.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { id: true, name: true } },
      ticket: {
        select: {
          id: true,
          ticket_code: true,
          ticket_type: true,
          device_type: true,
          status: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  // If coordinator, filter to only their store's tickets
  if (isCoordinator) {
    const assignments = await db.technicianStoreAssignment.findMany({
      where: { technician_id: session.userId },
      select: { store_id: true },
    });
    const myStoreIds = new Set(assignments.map((a) => a.store_id));

    const filtered = await Promise.all(
      requests.map(async (req) => {
        const ticket = await db.ticket.findUnique({
          where: { id: req.ticket_id },
          select: { store_location_id: true },
        });
        return myStoreIds.has(ticket?.store_location_id ?? "") || ticket?.store_location_id === null
          ? req
          : null;
      })
    );
    return NextResponse.json(filtered.filter(Boolean));
  }

  return NextResponse.json(requests);
}

// POST — accept or reject a request
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.role === "Administrator" || session.role === "Sales";
  const isCoordinator = !isAdmin && session.role === "Technician"
    ? (await db.user.findUnique({ where: { id: session.userId }, select: { is_team_leader: true } }))?.is_team_leader ?? false
    : false;

  if (!isAdmin && !isCoordinator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { requestId, action } = body as { requestId: string; action: "accept" | "reject" };

  if (!requestId || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const request = await db.ticketAssignmentRequest.findUnique({
    where: { id: requestId },
    include: { ticket: { select: { id: true, ticket_code: true, status: true, technician_id: true } } },
  });

  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "pending") return NextResponse.json({ error: "Request already handled" }, { status: 409 });
  if (request.ticket.technician_id) return NextResponse.json({ error: "Ticket already assigned" }, { status: 409 });

  if (action === "accept") {
    // Assign technician to ticket
    await db.$transaction([
      db.ticket.update({
        where: { id: request.ticket_id },
        data: { technician_id: request.technician_id },
      }),
      db.ticketAssignmentRequest.update({
        where: { id: requestId },
        data: { status: "approved" },
      }),
      // Reject all other pending requests for this ticket
      db.ticketAssignmentRequest.updateMany({
        where: { ticket_id: request.ticket_id, id: { not: requestId }, status: "pending" },
        data: { status: "rejected" },
      }),
    ]);

    // Notify the assigned technician
    await db.notification.create({
      data: {
        user_id: request.technician_id,
        ticket_id: request.ticket_id,
        type: "assigned",
        message: `✅ Your request for ticket #${request.ticket.ticket_code} was approved!`,
      },
    });
  } else {
    // Reject just this request
    await db.ticketAssignmentRequest.update({
      where: { id: requestId },
      data: { status: "rejected" },
    });

    // Notify the technician
    await db.notification.create({
      data: {
        user_id: request.technician_id,
        ticket_id: request.ticket_id,
        type: "status_update",
        message: `❌ Your request for ticket #${request.ticket.ticket_code} was declined.`,
      },
    });
  }

  return NextResponse.json({ success: true });
}
