import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";
import { appUrl } from "@/lib/sso/urls";

/**
 * GET /auth/session-ended — clear a session that no longer holds.
 *
 * requireSession() sends a request here when its cookie is well signed but the
 * session behind it is over: account deactivated, role changed, SSO session
 * ended, or password login switched off. A page cannot delete a cookie while
 * rendering, and sending it straight to /login would loop — proxy.ts sees the
 * signed cookie and bounces it back to a dashboard.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(appUrl("/login?ended=1", request));
  response.cookies.delete(SESSION_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
