"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { readServiceJob } from "@/lib/service-jobs";

async function mayManage(): Promise<boolean> {
  const session = await requireSession();
  return (await accessFor(session.userId)).can("manage_service_jobs");
}

function duplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function revalidateJobPages() {
  revalidatePath("/admin/service-jobs");
  revalidatePath("/technician/service-jobs");
}

const NO_ACCESS = { error: "Anda tidak punya akses untuk mengelola Daftar Jasa." };

export async function createServiceJobAction(formData: FormData) {
  if (!(await mayManage())) return NO_ACCESS;
  const job = readServiceJob(formData);
  if (!job.ok) return { error: job.error };
  try {
    const created = await db.serviceJob.create({ data: job.value, select: { id: true, name: true } });
    revalidateJobPages();
    return { success: true, job: created };
  } catch (err) {
    if (duplicate(err)) return { error: `Jasa "${job.value.name}" sudah ada di daftar.` };
    throw err;
  }
}

/**
 * Changing a job's price or points changes what new bills are given from now
 * on. Lines already on a bill keep the price and points they were given
 * (TicketCharge.job_points), so a month of targets is not rewritten after the
 * fact.
 */
export async function updateServiceJobAction(id: string, formData: FormData) {
  if (!(await mayManage())) return NO_ACCESS;
  const job = readServiceJob(formData);
  if (!job.ok) return { error: job.error };
  try {
    await db.serviceJob.update({
      where: { id },
      data: { ...job.value, is_active: formData.get("is_active") === "1" },
    });
  } catch (err) {
    if (duplicate(err)) return { error: `Jasa "${job.value.name}" sudah ada di daftar.` };
    throw err;
  }
  revalidateJobPages();
  return { success: true };
}
