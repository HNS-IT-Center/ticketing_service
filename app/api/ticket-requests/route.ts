import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  canActOnAssignmentRequest,
  isUnrestrictedAssignmentRole,
  CROSS_STORE_DENIED,
  type AssignmentAuthority,
} from "@/lib/assignment-authority";

/**
 * Who the caller is, for both halves of this route.
 *
 * `GET` used to build this inline and `POST` built a weaker version that never
 * looked at stores, so a coordinator could approve another store's ticket by
 * posting its `requestId` — the list hid those rows, nothing refused them.
 * Both halves now resolve the caller here and ask
 * `canActOnAssignmentRequest()`, so the two cannot drift apart again.
 */
async function resolveAuthority(session: {
  userId: string;
  role: string;
}): Promise<AssignmentAuthority> {
  if (isUnrestrictedAssignmentRole(session.role)) return { kind: "admin" };

  if (session.role !== "Technician") return { kind: "none" };

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true },
  });
  if (!user?.is_team_leader) return { kind: "none" };

  const assignments = await db.technicianStoreAssignment.findMany({
    where: { technician_id: session.userId },
    select: { store_id: true },
  });
  return { kind: "coordinator", storeIds: assignments.map((a) => a.store_id) };
}

// GET — list pending assignment requests (Admin/Sales/Coordinator only)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authority = await resolveAuthority(session);
  if (authority.kind === "none") {
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
          // Selected here so the store filter below needs no second round of
          // per-request queries. It used to run one `findUnique` per row.
          store_location_id: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  const visible = requests.filter((r) =>
    canActOnAssignmentRequest(authority, r.ticket.store_location_id),
  );

  return NextResponse.json(visible);
}

// POST — accept or reject a request
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authority = await resolveAuthority(session);
  if (authority.kind === "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { requestId, action } = body as { requestId: string; action: "accept" | "reject" };

  if (!requestId || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const request = await db.ticketAssignmentRequest.findUnique({
    where: { id: requestId },
    include: {
      ticket: {
        select: {
          id: true,
          ticket_code: true,
          status: true,
          technician_id: true,
          store_location_id: true,
        },
      },
    },
  });

  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // The store check belongs here, not only in the list above.
  if (!canActOnAssignmentRequest(authority, request.ticket.store_location_id)) {
    return NextResponse.json({ error: CROSS_STORE_DENIED }, { status: 403 });
  }

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
