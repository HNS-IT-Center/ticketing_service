import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  // Read SSO token securely from cookies
  const token = request.cookies.get("sso_token")?.value;
  const ssoUrl = process.env.NEXT_PUBLIC_SSO_URL || "";

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

    // Map their global role to a local role
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

    // Check if the user already exists in the local database
    let user = await db.user.findUnique({ where: { email } });

    if (user) {
      // If the user's new SSO role is no longer allowed in Ticketing
      if (!isStaff) {
        if (user.is_active) {
          await db.user.update({
            where: { id: user.id },
            data: { is_active: false }
          });
        }
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }

      // If they are staff but their role changed in SSO, update it
      if (user.role !== newRole || !user.is_active) {
        user = await db.user.update({
          where: { id: user.id },
          data: { 
            role: newRole as any,
            is_active: true // re-activate if they were previously deactivated
          }
        });
      }

      // Log them in using their synced role
      await createSession(user.id, user.role, user.name);
      return NextResponse.redirect(new URL(getDashboardRoute(user.role), request.url));
    }

    // If they aren't staff and don't have an account, block them
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
    
    return NextResponse.redirect(
      new URL(`/login?error=session_expired`, request.url)
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
