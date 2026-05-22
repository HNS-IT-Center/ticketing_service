"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";

// ─── Schemas ───────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
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
  };

  const validated = LoginSchema.safeParse(raw);
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return { message: "Invalid email or password" };
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return { message: "Invalid email or password" };
  }

  await createSession(user.id, user.role, user.name);

  // Redirect based on role
  switch (user.role) {
    case "Administrator":
    case "Sales":
      redirect("/admin/dashboard");
    case "Technician":
      redirect("/technician/dashboard");
    case "Customer":
    default:
      await deleteSession();
      return { message: "Customer login is disabled. Please use your ticket link." };
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
