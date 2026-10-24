import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check, public like the rest of /api (proxy.ts lets /api through).
 *
 * `GET /api/health` answers from the process alone. It is what the
 * container's HEALTHCHECK calls, and Docker replaces a container that fails
 * it — which brings back a hung server but not a database, so tying the two
 * together would only restart the app over and over while the database is
 * down.
 *
 * `GET /api/health?db=1` also runs `SELECT 1`, for an uptime monitor that
 * should raise the alarm when the database is unreachable. It reports up or
 * down and nothing else: the error goes to the server log, never to whoever
 * is asking.
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("db") !== "1") {
    return NextResponse.json({ status: "ok" });
  }
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("[health] database check failed:", err);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
