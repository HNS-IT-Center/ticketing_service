import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const notifications = await db.notification.findMany({
    where: { user_id: session.userId },
    orderBy: { created_at: "desc" },
    take: 20,
    include: {
      ticket: { select: { ticket_code: true } },
    },
  });

  return NextResponse.json(notifications);
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
