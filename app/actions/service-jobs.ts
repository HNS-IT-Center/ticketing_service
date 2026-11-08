"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { readServiceJob } from "@/lib/service-jobs";
import { CatalogUnavailableError, getCatalogItem } from "@/lib/catalog/hns-data";
import { NO_STOCK } from "@/lib/catalog/items";
import { logActivity } from "@/lib/activity";
import { formatRupiah } from "@/lib/charges";

/** The session when it may manage the Daftar Jasa, else null. */
async function mayManage() {
  const session = await requireSession();
  return (await accessFor(session.userId)).can("manage_service_jobs") ? session : null;
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
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const job = readServiceJob(formData);
  if (!job.ok) return { error: job.error };
  try {
    const created = await db.serviceJob.create({ data: job.value, select: { id: true, name: true } });
    await logActivity(session, "service_job.create", `Menambah jasa "${created.name}"${priceText(job.value.default_price)}, ${job.value.points} poin.`, {
      type: "service_job",
      id: created.id,
      label: created.name,
    });
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
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const job = readServiceJob(formData);
  if (!job.ok) return { error: job.error };
  const is_active = formData.get("is_active") === "1";
  try {
    await db.serviceJob.update({
      where: { id },
      data: { ...job.value, is_active },
    });
  } catch (err) {
    if (duplicate(err)) return { error: `Jasa "${job.value.name}" sudah ada di daftar.` };
    throw err;
  }
  await logActivity(
    session,
    "service_job.update",
    `Mengubah jasa "${job.value.name}"${priceText(job.value.default_price)}, ${job.value.points} poin, ${is_active ? "aktif" : "nonaktif"}.`,
    { type: "service_job", id, label: job.value.name },
  );
  revalidateJobPages();
  return { success: true };
}

function priceText(price: number | null): string {
  return price === null ? ", tanpa harga default" : `, harga ${formatRupiah(price)}`;
}

/**
 * Removes a job from the list for good — only one no bill has used. A job on
 * any bill line stays, because the line keeps naming it; it is deactivated
 * instead, which hides it from new bills.
 */
export async function deleteServiceJobAction(id: string) {
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const job = await db.serviceJob.findUnique({
    where: { id },
    select: { name: true, _count: { select: { charges: true } } },
  });
  if (!job) return { error: "Jasa tidak ditemukan." };
  if (job._count.charges > 0) {
    return {
      error: `"${job.name}" sudah dipakai ${job._count.charges}× di tagihan, jadi tidak bisa dihapus. Nonaktifkan saja lewat Ubah.`,
    };
  }
  await db.serviceJob.delete({ where: { id } });
  await logActivity(session, "service_job.delete", `Menghapus jasa "${job.name}".`, {
    type: "service_job",
    id,
    label: job.name,
  });
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
    item = await getCatalogItem(id, NO_STOCK);
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
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const item = await readAccurateItem(formData);
  if ("error" in item) return item;
  const job = await db.serviceJob.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!job) return { error: "Jasa tidak ditemukan." };
  await db.serviceJob.update({ where: { id }, data: item });
  await logActivity(
    session,
    "service_job.accurate",
    item.accurate_sku
      ? `Memetakan jasa "${job.name}" ke item Accurate ${item.accurate_sku} (${item.accurate_name}).`
      : `Menghapus kode Accurate jasa "${job.name}".`,
    { type: "service_job", id, label: job.name },
  );
  revalidateJobPages();
  return { success: true };
}

/**
 * One Accurate item for every job that has none yet — most of the shop's jobs
 * go into Accurate as the same "JASA SERVICE". Jobs already mapped are left
 * alone.
 */
export async function applyAccurateItemToUnmappedAction(formData: FormData) {
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const item = await readAccurateItem(formData);
  if ("error" in item) return item;
  if (item.accurate_item_id === null) return { error: "Pilih item Accurate dulu." };
  const updated = await db.serviceJob.updateMany({ where: { accurate_item_id: null }, data: item });
  await logActivity(
    session,
    "service_job.accurate",
    `Memetakan ${updated.count} jasa yang belum punya kode ke item Accurate ${item.accurate_sku} (${item.accurate_name}).`,
  );
  revalidateJobPages();
  return { success: true, count: updated.count };
}
