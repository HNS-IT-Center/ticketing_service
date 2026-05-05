"use server";

import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const profileSchema = z.object({
  userId:  z.string().min(1),
  name:    z.string().min(2, "Name must be at least 2 characters"),
  phone:   z.string().regex(/^\+62\d{9,13}$/, "Phone must be in +62XXXXXXXXX format"),
  address: z.string().optional(),
});

export async function updateTechnicianProfileAction(data: {
  userId: string;
  name: string;
  phone: string;
  address: string;
}) {
  const session = await requireRole("Technician");
  if (session.userId !== data.userId) return { error: "Unauthorized" };

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.user.update({
    where: { id: session.userId },
    data: {
      name:         parsed.data.name,
      phone_number: parsed.data.phone,
      address:      parsed.data.address ?? "",
    },
  });

  revalidatePath("/technician/profile");
  return { success: true };
}

export async function updateAdminProfileAction(data: {
  userId: string;
  name: string;
  phone: string;
  address: string;
}) {
  const session = await requireRole("Administrator");
  if (session.userId !== data.userId) return { error: "Unauthorized" };

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.user.update({
    where: { id: session.userId },
    data: {
      name:         parsed.data.name,
      phone_number: parsed.data.phone,
      address:      parsed.data.address ?? "",
    },
  });

  revalidatePath("/admin/profile");
  return { success: true };
}
