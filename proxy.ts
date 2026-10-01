import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";
import { canEnter, dashboardPathForRoleName, isPublicTicketPath } from "@/lib/routes";

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || request.url;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const baseUrl = getBaseUrl(request);

  // The customer-facing tracking page, and the page a denied role lands on.
  //
  // `isPublicTicketPath` matches an ISO date plus one token segment. The guard
  // here used to test `startsWith("/ticket")` against a route that has never
  // existed, while the real page lives at /{date}/{token} — so every customer
  // who followed the link in their WhatsApp message was sent to /login. The
  // `PUBLIC_ROUTES` constant that was meant to drive this was declared and
  // never read.
  if (isPublicTicketPath(pathname) || pathname.startsWith("/unauthorized")) {
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
  // `uploads/` is excluded for the local storage driver (STORAGE_DRIVER=local),
  // which serves files from public/uploads. Without it the auth guard redirects
  // them to /login, breaking proof media on the public tracking page, which has
  // no session by design. Inert in production: R2 returns absolute URLs on
  // another host, so /uploads is never requested there.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/|uploads/|_vercel|script\\.js).*)" ],
};
