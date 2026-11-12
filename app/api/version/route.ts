import { currentBuildId } from "@/lib/build-id";

export const dynamic = "force-dynamic";

/**
 * Which build is serving now, so an open page can tell it is older than the
 * server and ask for a reload before its next save fails (StaleDeployNotice).
 * Public: a build id says nothing about data.
 */
export function GET() {
  return Response.json({ build: currentBuildId() }, { headers: { "Cache-Control": "no-store" } });
}
