"use server";

import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateProfileSchema = z.object({
  userId:  z.string().min(1),
  name:    z.string().min(2, "Name must be at least 2 characters"),
  phone:   z.string().regex(/^\+62\d{9,13}$/, "Phone must be in +62XXXXXXXXX format"),
  address: z.string().optional(),
});

export async function updateProfileAction(data: {
  userId: string;
  name: string;
  phone: string;
  address: string;
}) {
  const session = await requireRole("Customer");

  // Ensure the user can only update their own profile
  if (session.userId !== data.userId) {
    return { error: "Unauthorized" };
  }

  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await db.user.update({
    where: { id: session.userId },
    data: {
      name:         parsed.data.name,
      phone_number: parsed.data.phone,
      address:      parsed.data.address ?? "",
    },
  });

  revalidatePath("/customer/profile");
  revalidatePath("/customer/dashboard");
  return { success: true };
}
