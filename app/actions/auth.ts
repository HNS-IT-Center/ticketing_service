"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";

// ─── Schemas ───────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
  rememberMe?: boolean;
} | undefined;

// ─── Register ──────────────────────────────────────────────────────────────
// Registration for customers is disabled in Phase 3.
// Admins create staff accounts directly.

// ─── Login ─────────────────────────────────────────────────────────────────

export async function loginAction(
  state: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe") === "on",
  };

  const validated = LoginSchema.safeParse(raw);
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors, rememberMe: raw.rememberMe };
  }

  const { email, password, rememberMe } = validated.data;

  let user;
  try {
    user = await db.user.findUnique({ where: { email: email as string } });
  } catch (err) {
    console.error("[loginAction] DB error:", err);
    return {
      message: "A server error occurred. Please try again later.",
      rememberMe,
    };
  }

  if (!user || !user.password) {
    return { message: "Invalid email or password", rememberMe };
  }

  const passwordMatch = await bcrypt.compare(password as string, user.password);

  if (!passwordMatch) {
    return { message: "Invalid email or password", rememberMe };
  }

  // Guard: deactivated accounts cannot log in
  if (!user.is_active) {
    return { message: "This account has been deactivated. Please contact an administrator.", rememberMe };
  }

  try {
    await createSession(user.id, user.role, user.name, rememberMe);
  } catch (err) {
    console.error("[loginAction] createSession error:", err);
    return {
      message: "Failed to create session. Please check server configuration.",
      rememberMe,
    };
  }

  // Redirect based on role.
  // NOTE: redirect() throws a special Next.js error (NEXT_REDIRECT) — this is intentional.
  // It must NOT be inside a try/catch that re-throws generic errors.
  switch (user.role) {
    case "Administrator":
    case "Sales":
      redirect("/admin/dashboard");
    case "Technician":
      redirect("/technician/dashboard");
    case "Customer":
    default:
      await deleteSession();
      return { message: "Customer login is disabled. Please use your ticket link.", rememberMe };
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await deleteSession();
  revalidatePath("/", "layout");
  redirect("/login");
}
