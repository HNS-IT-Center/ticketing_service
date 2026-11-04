"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { AUDIENCES, CAPABILITIES, CAPABILITY_INFO } from "@/lib/access";
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
      const allowed = formData.get(`${capability}:${audience}`) === "on";
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
