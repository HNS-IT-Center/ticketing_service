import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Cache-control: no-store since this is user-specific real-time data
// But we can avoid unnecessary DB hits with conditional response

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const url = new URL(request.url);
  const countOnly = url.searchParams.get("count") === "1";

  if (countOnly) {
    // Fast path: just return unread count (one indexed query, no joins)
    const unreadCount = await db.notification.count({
      where: { user_id: session.userId, is_read: false },
    });
    return NextResponse.json(
      { unreadCount },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // Full list path: fetch recent notifications with ticket code
  const notifications = await db.notification.findMany({
    where: { user_id: session.userId },
    orderBy: { created_at: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      ticket_id: true,
      reference_id: true,
      is_read: true,
      created_at: true,
      message: true,
      ticket: { select: { ticket_code: true } },
    },
  });

  return NextResponse.json(notifications, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  await db.notification.updateMany({
    where: { user_id: session.userId, is_read: false },
    data: { is_read: true },
  });

  return NextResponse.json({ ok: true });
}
