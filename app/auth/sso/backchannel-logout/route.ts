import { verifyLogoutToken } from "@/lib/sso/backchannel";
import { revokeSsoSessionsFor } from "@/lib/sso/sso-session";

/**
 * POST /auth/sso/backchannel-logout — SSO's server tells this app a session ended.
 *
 * Called server to server, with no cookie and no CSRF token, so it sits outside
 * the session guard in proxy.ts; the `logout_token` signature is its only
 * credential. Every local session tied to the token's `sid` is revoked, which
 * ends it on its next request. SSO sends this once with a 5 second timeout and
 * no retry, so it answers fast and does nothing else.
 */
export async function POST(request: Request) {
  let token: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("logout_token");
    token = typeof value === "string" ? value : null;
  } catch {
    token = null;
  }

  const target = token ? await verifyLogoutToken(token) : null;
  if (!target) {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  await revokeSsoSessionsFor(target, "backchannel_logout");
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
