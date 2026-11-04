"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { readServiceJob } from "@/lib/service-jobs";
import { CatalogUnavailableError, getCatalogItem } from "@/lib/catalog/hns-data";

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

type AccurateSnapshot = { accurate_item_id: number | null; accurate_sku: string | null; accurate_name: string | null };

/**
 * The Accurate item sent with the form, re-read in the catalogue by id so the
 * code printed for the cashier is Accurate's and not whatever the browser
 * sent. An empty id clears the mapping.
 */
async function readAccurateItem(formData: FormData): Promise<{ error: string } | AccurateSnapshot> {
  const raw = String(formData.get("accurate_item_id") ?? "").trim();
  if (!raw) return { accurate_item_id: null, accurate_sku: null, accurate_name: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { error: "Item Accurate tidak valid." };
  let item: Awaited<ReturnType<typeof getCatalogItem>>;
  try {
    item = await getCatalogItem(id);
  } catch (err) {
    if (!(err instanceof CatalogUnavailableError)) throw err;
    console.error("[CATALOG LOOKUP]", err.message);
    return { error: "Katalog Accurate sedang tidak dapat dihubungi. Coba lagi sebentar." };
  }
  if (!item) return { error: "Item tidak ditemukan di katalog Accurate." };
  return { accurate_item_id: item.id, accurate_sku: item.sku, accurate_name: item.name };
}

/** Which Accurate item the cashier enters for this job; printed on the invoice. */
export async function setServiceJobAccurateItemAction(id: string, formData: FormData) {
  if (!(await mayManage())) return NO_ACCESS;
  const item = await readAccurateItem(formData);
  if ("error" in item) return item;
  const job = await db.serviceJob.findUnique({ where: { id }, select: { id: true } });
  if (!job) return { error: "Jasa tidak ditemukan." };
  await db.serviceJob.update({ where: { id }, data: item });
  revalidateJobPages();
  return { success: true };
}

/**
 * One Accurate item for every job that has none yet — most of the shop's jobs
 * go into Accurate as the same "JASA SERVICE". Jobs already mapped are left
 * alone.
 */
export async function applyAccurateItemToUnmappedAction(formData: FormData) {
  if (!(await mayManage())) return NO_ACCESS;
  const item = await readAccurateItem(formData);
  if ("error" in item) return item;
  if (item.accurate_item_id === null) return { error: "Pilih item Accurate dulu." };
  const updated = await db.serviceJob.updateMany({ where: { accurate_item_id: null }, data: item });
  revalidateJobPages();
  return { success: true, count: updated.count };
}
