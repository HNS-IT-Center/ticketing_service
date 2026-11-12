"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { AUDIENCES, AUDIENCE_LABELS, CAPABILITIES, CAPABILITY_INFO, appliesTo, isAudience } from "@/lib/access";
import { logActivity } from "@/lib/activity";

/**
 * Save the access matrix from Admin → Pengaturan Akses.
 *
 * The form posts one checkbox per (capability, audience), named
 * "capability:audience". A setting equal to its default is stored as no row at
 * all, so the table only ever holds what the owner deliberately changed — and
 * a default improved later in code reaches everyone who never touched it.
 * Administrators are not in the form: they always may.
 */
export async function saveAccessRulesAction(formData: FormData) {
  const session = await requireRole("Administrator");

  const writes = [];
  for (const capability of CAPABILITIES) {
    for (const audience of AUDIENCES) {
      if (audience === "administrator") continue;
      // A setting that cannot apply to this group is never stored.
      const allowed = appliesTo(capability, audience) && formData.get(`${capability}:${audience}`) === "on";
      const isDefault = CAPABILITY_INFO[capability].defaults.includes(audience) === allowed;
      writes.push(
        isDefault
          ? db.accessRule.deleteMany({ where: { capability, audience } })
          : db.accessRule.upsert({
              where: { capability_audience: { capability, audience } },
              create: { capability, audience, allowed, updated_by_id: session.userId },
              update: { allowed, updated_by_id: session.userId },
            })
      );
    }
  }
  await db.$transaction(writes);
  const changed = await db.accessRule.count();
  await logActivity(
    session,
    "access.update",
    `Menyimpan pengaturan akses (${changed} aturan berbeda dari bawaan).`,
    { type: "access" },
  );

  revalidatePath("/admin/settings/access");
  return { success: true };
}

/**
 * Save one role's settings from its edit page (Pengguna & Akses → Role & Izin).
 * Same storage rule as the matrix: a value equal to the default is no row.
 * Only this group's rows are touched, so two people editing two roles cannot
 * overwrite each other.
 */
export async function saveAudienceAccessAction(audience: string, formData: FormData): Promise<{ success: true } | { error: string }> {
  const session = await requireRole("Administrator");
  if (!isAudience(audience) || audience === "administrator") return { error: "Role ini tidak bisa diubah." };

  const writes = CAPABILITIES.map((capability) => {
    const allowed = appliesTo(capability, audience) && formData.get(capability) === "on";
    const isDefault = CAPABILITY_INFO[capability].defaults.includes(audience) === allowed;
    return isDefault
      ? db.accessRule.deleteMany({ where: { capability, audience } })
      : db.accessRule.upsert({
          where: { capability_audience: { capability, audience } },
          create: { capability, audience, allowed, updated_by_id: session.userId },
          update: { allowed, updated_by_id: session.userId },
        });
  });
  await db.$transaction(writes);
  const changed = await db.accessRule.count({ where: { audience } });
  await logActivity(
    session,
    "access.update",
    `Menyimpan izin role ${AUDIENCE_LABELS[audience]} (${changed} berbeda dari bawaan).`,
    { type: "access" },
  );

  revalidatePath("/admin/settings/access");
  revalidatePath(`/admin/settings/access/${audience}`);
  return { success: true };
}
