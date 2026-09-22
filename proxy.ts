import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";
import { canEnter, dashboardPathForRoleName } from "@/lib/routes";

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || request.url;
}

const PUBLIC_ROUTES = ["/login", "/register", "/ticket", "/unauthorized"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const baseUrl = getBaseUrl(request);

  // Allow public ticket tracking route and unauthorized page without redirecting authenticated users
  if (pathname.startsWith("/ticket") || pathname.startsWith("/unauthorized")) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from login/register
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    const sessionCookie = request.cookies.get("session")?.value;
    const session = await decrypt(sessionCookie);
    if (session) {
      return NextResponse.redirect(
        new URL(dashboardPathForRoleName(session.role), baseUrl)
      );
    }
    return NextResponse.next();
  }

  // Allow API routes
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Protect all other routes
  const sessionCookie = request.cookies.get("session")?.value;
  const session = await decrypt(sessionCookie);

  if (!session) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  // Role-based access. Portal ownership and the role → dashboard mapping both
  // come from lib/routes.ts, so a redirect can never target a route the same
  // role would be bounced out of again.
  if (!canEnter(pathname, session.role)) {
    return NextResponse.redirect(
      new URL(dashboardPathForRoleName(session.role), baseUrl)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/|_vercel|script\\.js).*)" ],
};
