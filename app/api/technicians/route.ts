import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

/**
 * GET /api/technicians?exclude=<userId>
 * Returns all active technicians for the reassignment dropdown.
 * Only accessible by Administrators.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session.role !== "Administrator") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const exclude = searchParams.get("exclude");

  const technicians = await db.user.findMany({
    where: {
      role: "Technician",
      is_active: true,
      ...(exclude ? { id: { not: exclude } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return Response.json({ technicians });
}
