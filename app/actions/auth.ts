"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";

// ─── Schemas ───────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone_number: z
    .string()
    .regex(/^\+62\d{9,13}$/, "Phone must start with +62 and be 9-13 digits"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
} | undefined;

// ─── Register ──────────────────────────────────────────────────────────────

export async function registerAction(
  state: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone_number: formData.get("phone_number"),
    address: formData.get("address"),
    password: formData.get("password"),
  };

  const validated = RegisterSchema.safeParse(raw);
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, phone_number, address, password } = validated.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["Email already in use"] } };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      name,
      email,
      phone_number,
      address,
      password: hashedPassword,
      role: "Customer",
    },
  });

  await createSession(user.id, user.role, user.name);
  redirect("/customer/dashboard");
}

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
      redirect("/admin/dashboard");
    case "Technician":
      redirect("/technician/dashboard");
    default:
      redirect("/customer/dashboard");
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
