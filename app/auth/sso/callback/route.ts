import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import { getSsoConfig, ssoEnv } from "@/lib/sso/config";
import { FLOW_COOKIE, flowCookieOptions, openFlow } from "@/lib/sso/flow";
import { linkSsoUser } from "@/lib/sso/link-user";
import { createSsoSession } from "@/lib/sso/sso-session";
import { appUrl } from "@/lib/sso/urls";
import { canEnter, destinationForRoleName, DENIED_DESTINATION } from "@/lib/routes";
import { encrypt, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-token";

/** Constant-time string comparison, as the spec asks for the state check. */
function sameSecret(a: string | null, b: string): boolean {
  if (a === null) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** SSO error codes the error page explains; anything else is shown generically. */
const KNOWN_SSO_ERRORS = new Set(["access_denied", "login_required", "interaction_required"]);

/**
 * GET /auth/sso/callback — where SSO sends the browser back.
 *
 * openid-client checks `state` against the flow cookie, `iss` against the
 * issuer (RFC 9207 — the server advertises it), exchanges the code with the
 * PKCE verifier, and verifies the id_token: RS256 signature from the JWKS,
 * `iss`, `aud`, `exp` and `nonce`. `azp` is checked here.
 *
 * The callback URL handed to openid-client is the configured redirect URI plus
 * this request's query string — never `request.url`, which behind the proxy is
 * an internal address and makes the token endpoint answer `invalid_grant`.
 */
export async function GET(request: NextRequest) {
  const env = ssoEnv();
  if (!env) return NextResponse.redirect(appUrl("/login?sso=off", request));

  // The flow cookie is single use: cleared on every way out of here.
  const finish = (path: string) => {
    const res = NextResponse.redirect(appUrl(path, request));
    res.cookies.set(FLOW_COOKIE, "", flowCookieOptions(0));
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const fail = (code: string) => finish(`/auth/sso/error?code=${encodeURIComponent(code)}`);

  const params = request.nextUrl.searchParams;
  const ssoError = params.get("error");
  if (ssoError) return fail(KNOWN_SSO_ERRORS.has(ssoError) ? ssoError : "sso_error");

  const flow = await openFlow(request.cookies.get(FLOW_COOKIE)?.value);
  if (!flow) return fail("flow_expired");
  // Checked here in constant time; openid-client checks it again below.
  if (!sameSecret(params.get("state"), flow.state)) return fail("callback_failed");

  let config: oidc.Configuration;
  try {
    config = await getSsoConfig();
  } catch (err) {
    console.error("[SSO DISCOVERY ERROR]", err);
    return fail("sso_unreachable");
  }

  const callbackUrl = new URL(env.redirectUri);
  callbackUrl.search = request.nextUrl.search;

  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
  try {
    tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
  } catch (err) {
    // A wrong state, a replayed or expired code, a bad signature: all end here,
    // with nothing created. The detail is for the server log only.
    console.error("[SSO CALLBACK ERROR]", err);
    return fail("callback_failed");
  }

  const claims = tokens.claims();
  if (!claims?.sub) return fail("callback_failed");
  if (claims.azp !== undefined && claims.azp !== env.clientId) return fail("callback_failed");

  const result = await linkSsoUser({
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name: typeof claims.name === "string" ? claims.name : null,
    preferredUsername: typeof claims.preferred_username === "string" ? claims.preferred_username : null,
  });
  if (!result.ok) return fail(result.reason);

  const ssoSessionId = await createSsoSession({
    userId: result.user.id,
    sub: claims.sub,
    sid: typeof claims.sid === "string" ? claims.sid : null,
    tokens,
  });

  const destination = destinationForRoleName(result.user.role);
  const target = !destination.allowed
    ? DENIED_DESTINATION
    : flow.returnTo && canEnter(flow.returnTo, result.user.role)
      ? flow.returnTo
      : destination.dashboard;

  // A brand-new cookie: nothing from before this sign-in carries over.
  const response = finish(target);
  response.cookies.set(
    SESSION_COOKIE,
    await encrypt({ userId: result.user.id, role: result.user.role, name: result.user.name, sso: ssoSessionId }),
    sessionCookieOptions()
  );
  return response;
}
