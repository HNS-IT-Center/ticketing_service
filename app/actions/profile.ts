"use server";

import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { revalidatePath, revalidateTag } from "next/cache";
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

  revalidateTag(`user-profile:${session.userId}`, "max");
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

// ─── Equip / Unequip Title ─────────────────────────────────────────────────
export async function equipTitleAction(titleKey: string | null) {
  const session = await requireRole("Technician");

  // Validate: if equipping, the title must exist in this user's inventory
  if (titleKey !== null) {
    const owned = await db.userTitle.findUnique({
      where: {
        user_id_title_key: { user_id: session.userId, title_key: titleKey },
      },
    });
    if (!owned) return { error: "Title not found in your inventory" };
  }

  await db.user.update({
    where: { id: session.userId },
    data: { active_title: titleKey },
  });

  // Invalidate all relevant caches
  revalidateTag(`user-profile:${session.userId}`, "max");
  revalidateTag(`user-titles:${session.userId}`, "max");
  revalidateTag("leaderboard-techs", "max"); // badge in All Rankings must update

  revalidatePath("/technician/profile");
  revalidatePath("/technician/dashboard");
  return { success: true };
}
