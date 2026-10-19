import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import { getSsoConfig, ssoEnv, SSO_SCOPE } from "@/lib/sso/config";
import { FLOW_COOKIE, flowCookieOptions, sealFlow } from "@/lib/sso/flow";
import { safeReturnTo } from "@/lib/sso/return-to";
import { appUrl } from "@/lib/sso/urls";

/**
 * GET /auth/sso/login — start an HNS SSO sign-in.
 *
 * Also the "Initiate Login URL" the SSO portal opens. Creates a fresh state,
 * nonce and PKCE verifier for this one attempt, keeps them in a short-lived
 * signed cookie, and sends the browser to SSO's authorize endpoint.
 */
export async function GET(request: NextRequest) {
  const env = ssoEnv();
  if (!env) return NextResponse.redirect(appUrl("/login?sso=off", request));

  let config: oidc.Configuration;
  try {
    config = await getSsoConfig();
  } catch (err) {
    console.error("[SSO DISCOVERY ERROR]", err);
    return NextResponse.redirect(appUrl("/auth/sso/error?code=sso_unreachable", request));
  }

  const params = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(params.get("return_to"));
  const loginHint = params.get("login_hint")?.trim();

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorize: Record<string, string> = {
    redirect_uri: env.redirectUri,
    scope: SSO_SCOPE,
    response_type: "code",
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  };
  if (loginHint && loginHint.length <= 254) authorize.login_hint = loginHint;

  const response = NextResponse.redirect(oidc.buildAuthorizationUrl(config, authorize).href);
  response.cookies.set(FLOW_COOKIE, await sealFlow({ state, nonce, codeVerifier, returnTo }), flowCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
