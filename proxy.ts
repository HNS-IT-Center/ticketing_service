import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const PUBLIC_ROUTES = ["/login", "/register"];
const ADMIN_ROUTES = ["/admin"];
const TECHNICIAN_ROUTES = ["/technician"];
const CUSTOMER_ROUTES = ["/customer"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    // If already logged in, redirect to dashboard
    const sessionCookie = request.cookies.get("session")?.value;
    const session = await decrypt(sessionCookie);
    if (session) {
      return NextResponse.redirect(
        new URL(getDashboardRoute(session.role), request.url)
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Role-based access
  if (
    ADMIN_ROUTES.some((r) => pathname.startsWith(r)) &&
    session.role !== "Administrator"
  ) {
    return NextResponse.redirect(
      new URL(getDashboardRoute(session.role), request.url)
    );
  }

  if (
    TECHNICIAN_ROUTES.some((r) => pathname.startsWith(r)) &&
    session.role !== "Technician"
  ) {
    return NextResponse.redirect(
      new URL(getDashboardRoute(session.role), request.url)
    );
  }

  if (
    CUSTOMER_ROUTES.some((r) => pathname.startsWith(r)) &&
    session.role !== "Customer" &&
    session.role !== "Sales"
  ) {
    return NextResponse.redirect(
      new URL(getDashboardRoute(session.role), request.url)
    );
  }

  return NextResponse.next();
}

function getDashboardRoute(role: string): string {
  switch (role) {
    case "Administrator":
      return "/admin/dashboard";
    case "Technician":
      return "/technician/dashboard";
    case "Customer":
    case "Sales":
      return "/customer/dashboard";
    default:
      return "/login";
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)" ],
};
