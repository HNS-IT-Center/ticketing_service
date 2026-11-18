import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The check every /api/integrations/ecommerce route makes: called server to
 * server with `Authorization: Bearer <TICKETING_INTEGRATION_TOKEN>`, the
 * secret both systems share. `proxy.ts` lets every /api path through, so this
 * is the only check on these routes.
 */

export const NO_STORE = { "Cache-Control": "no-store" };

export function integrationJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function tokenMatches(given: string, expected: string): boolean {
  // Hashed first so the comparison takes the same time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The refusal to send, or null when the caller holds the token. 503 when this server has none set. */
export function refuseIntegrationCaller(request: Request): Response | null {
  const expected = process.env.TICKETING_INTEGRATION_TOKEN?.trim();
  if (!expected) return integrationJson({ error: "Integrasi belum diatur di Ticketing." }, 503);
  const given = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!given || !tokenMatches(given, expected)) return integrationJson({ error: "Token tidak valid." }, 401);
  return null;
}
