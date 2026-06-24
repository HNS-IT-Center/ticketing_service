import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("sso_token")?.value;
  const ssoUrl = process.env.NEXT_PUBLIC_SSO_URL || "http://localhost:3000";

  console.log("=== SSO SYNC CALLED ===");
  console.log("Token exists?", !!token);

  // If there's no SSO token, redirect to login
  if (!token) {
    console.log("Redirecting to login: No token found in cookies.");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
    });

    const email = payload.email as string;
    const globalRole = payload.globalRole as string;
    const departmentName = payload.departmentName as string | undefined;
    const name = (payload.name as string) || "User";

    // Check if the user already exists in the local database
    let user = await db.user.findUnique({ where: { email } });

    if (user) {
      // User exists, just log them in using their local role
      await createSession(user.id, user.role, user.name);
      return NextResponse.redirect(new URL(getDashboardRoute(user.role), request.url));
    }

    // User DOES NOT exist, map their global role to a local role
    let newRole = "Customer";
    let isStaff = false;

    if (globalRole === "SUPER_ADMIN" || globalRole === "ADMIN") {
      newRole = "Administrator";
      isStaff = true;
    } else if (departmentName && departmentName.toLowerCase().includes("technician")) {
      newRole = "Technician";
      isStaff = true;
    } else if (departmentName && departmentName.toLowerCase().includes("sales")) {
      newRole = "Sales";
      isStaff = true;
    }

    // If they aren't staff, we don't allow them in via SSO (per requirements)
    if (!isStaff) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    // Create the new staff user in the local database
    user = await db.user.create({
      data: {
        email,
        name,
        role: newRole as any,
        phone_number: "-", // Placeholder
        address: "-",      // Placeholder
        // password is now optional, so we don't need to provide it
      },
    });

    // Log the newly created user in
    console.log("Creating local session for:", user.email);
    await createSession(user.id, user.role, user.name);
    return NextResponse.redirect(new URL(getDashboardRoute(user.role), request.url));
  } catch (err: any) {
    console.error("=== SSO Sync Catch Error ===");
    console.error(err);
    
    // Pass the error message back to the UI so we can see it
    const errorMessage = err.message || "Unknown error";
    return NextResponse.redirect(
      new URL(`/login?error=session_expired&detail=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
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
