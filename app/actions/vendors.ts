"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { logActivity } from "@/lib/activity";
import {
  VENDOR_ROLE_INFO,
  readVendorLocation,
  readVendorRoles,
  vendorLocationText,
  vendorRolesOf,
} from "@/lib/vendors";

function readVendor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  return { name, contact, notes, location: readVendorLocation(formData), ...readVendorRoles(formData) };
}

function invalid(v: ReturnType<typeof readVendor>): string | null {
  if (v.name.length < 2) return "Nama vendor minimal 2 karakter.";
  if (vendorRolesOf(v).length === 0) return "Centang minimal satu peran vendor.";
  return null;
}

/** The session when it may manage vendors, else null. */
async function mayManage() {
  const session = await requireSession();
  return (await accessFor(session.userId)).can("manage_vendors") ? session : null;
}

/** "Klaim garansi + Service eksternal, Dalam kota (LKL)" — for the activity log. */
function vendorText(v: ReturnType<typeof readVendor>): string {
  const roles = vendorRolesOf(v).map((r) => VENDOR_ROLE_INFO[r].label).join(" + ");
  const where = vendorLocationText(v.location);
  return [roles, where].filter(Boolean).join(", ");
}

const NO_ACCESS = { error: "Anda tidak punya akses untuk mengelola vendor." };

function duplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function revalidateVendorPages() {
  revalidatePath("/admin/vendors");
  revalidatePath("/rma/vendors");
}

export async function createVendorAction(formData: FormData) {
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const v = readVendor(formData);
  const problem = invalid(v);
  if (problem) return { error: problem };
  try {
    const vendor = await db.vendor.create({ data: v, select: { id: true, name: true } });
    await logActivity(session, "vendor.create", `Menambah vendor "${vendor.name}" (${vendorText(v)}).`, {
      type: "vendor",
      id: vendor.id,
      label: vendor.name,
    });
    revalidateVendorPages();
    return { success: true, vendor };
  } catch (err) {
    if (duplicate(err)) return { error: `Vendor "${v.name}" sudah ada di daftar. Ubah perannya di sana.` };
    throw err;
  }
}

export async function updateVendorAction(id: string, formData: FormData) {
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const v = readVendor(formData);
  const problem = invalid(v);
  if (problem) return { error: problem };
  const is_active = formData.get("is_active") === "1";
  try {
    await db.vendor.update({ where: { id }, data: { ...v, is_active } });
  } catch (err) {
    if (duplicate(err)) return { error: `Vendor "${v.name}" sudah ada di daftar.` };
    throw err;
  }
  await logActivity(
    session,
    "vendor.update",
    `Mengubah vendor "${v.name}" (${vendorText(v)}, ${is_active ? "aktif" : "nonaktif"}).`,
    { type: "vendor", id, label: v.name },
  );
  revalidateVendorPages();
  return { success: true };
}

/**
 * Removes a vendor for good — only one no bill and no RMA case names. One that
 * is named stays, so the bill and the case keep saying who did the work; it is
 * deactivated instead, which takes it out of every picker.
 */
export async function deleteVendorAction(id: string) {
  const session = await mayManage();
  if (!session) return NO_ACCESS;
  const vendor = await db.vendor.findUnique({
    where: { id },
    select: { name: true, _count: { select: { charges: true, rma_cases: true } } },
  });
  if (!vendor) return { error: "Vendor tidak ditemukan." };
  const { charges, rma_cases } = vendor._count;
  if (charges + rma_cases > 0) {
    const used = [charges && `${charges} baris tagihan`, rma_cases && `${rma_cases} case RMA`].filter(Boolean).join(" dan ");
    return { error: `"${vendor.name}" sudah tercatat di ${used}, jadi tidak bisa dihapus. Nonaktifkan saja lewat Ubah.` };
  }
  await db.vendor.delete({ where: { id } });
  await logActivity(session, "vendor.delete", `Menghapus vendor "${vendor.name}".`, {
    type: "vendor",
    id,
    label: vendor.name,
  });
  revalidateVendorPages();
  return { success: true };
}
