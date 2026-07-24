import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || request.url;
}

const PUBLIC_ROUTES = ["/login", "/register", "/ticket", "/unauthorized"];
const ADMIN_ROUTES = ["/admin"];
const TECHNICIAN_ROUTES = ["/technician"];

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
        new URL(getDashboardRoute(session.role), baseUrl)
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

  // Role-based access
  if (
    ADMIN_ROUTES.some((r) => pathname.startsWith(r)) &&
    session.role !== "Administrator" &&
    session.role !== "Sales"
  ) {
    return NextResponse.redirect(
      new URL(getDashboardRoute(session.role), baseUrl)
    );
  }

  if (
    TECHNICIAN_ROUTES.some((r) => pathname.startsWith(r)) &&
    session.role !== "Technician"
  ) {
    return NextResponse.redirect(
      new URL(getDashboardRoute(session.role), baseUrl)
    );
  }

  return NextResponse.next();
}

function getDashboardRoute(role: string): string {
  switch (role) {
    case "Administrator":
    case "Sales":
      return "/admin/dashboard";
    case "Technician":
      return "/technician/dashboard";
    default:
      return "/login";
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/|_vercel|script\\.js).*)" ],
};
