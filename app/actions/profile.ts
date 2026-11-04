"use server";

import { requireRole, requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";

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
  await logActivity(session, "profile.update", "Mengubah profil sendiri (nama, telepon, alamat).", {
    type: "user",
    id: session.userId,
    label: parsed.data.name,
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
  await logActivity(session, "profile.update", "Mengubah profil sendiri (nama, telepon, alamat).", {
    type: "user",
    id: session.userId,
    label: parsed.data.name,
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
  await logActivity(session, "profile.title", titleKey ? `Memasang gelar ${titleKey}.` : "Melepas gelar.", {
    type: "user",
    id: session.userId,
  });

  // Invalidate all relevant caches
  revalidateTag(`user-profile:${session.userId}`, "max");
  revalidateTag(`user-titles:${session.userId}`, "max");
  revalidateTag("leaderboard-techs", "max"); // badge in All Rankings must update

  revalidatePath("/technician/profile");
  revalidatePath("/technician/dashboard"); // removes badge from header immediately
  return { success: true };
}

// ─── Change Password ────────────────────────────────────────────────────────
export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const session = await requireSession();

  if (data.newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (data.newPassword !== data.confirmPassword) {
    return { error: "New passwords do not match." };
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { password: true },
  });
  if (!user) return { error: "User not found." };

  if (user.password) {
    const isCorrect = await bcrypt.compare(data.currentPassword, user.password);
    if (!isCorrect) return { error: "Current password is incorrect." };
  }

  const hashed = await bcrypt.hash(data.newPassword, 12);
  await db.user.update({
    where: { id: session.userId },
    data: { password: hashed },
  });
  await logActivity(session, "profile.password", "Mengganti password sendiri.", { type: "user", id: session.userId });

  return { success: true };
}
