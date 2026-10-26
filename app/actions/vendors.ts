"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import { readVendorRoles, vendorRolesOf } from "@/lib/vendors";

function readVendor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  return { name, contact, notes, ...readVendorRoles(formData) };
}

function invalid(v: ReturnType<typeof readVendor>): string | null {
  if (v.name.length < 2) return "Nama vendor minimal 2 karakter.";
  if (vendorRolesOf(v).length === 0) return "Centang minimal satu peran vendor.";
  return null;
}

async function mayManage(): Promise<boolean> {
  const session = await requireSession();
  return (await accessFor(session.userId)).can("manage_vendors");
}

function duplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function revalidateVendorPages() {
  revalidatePath("/admin/vendors");
  revalidatePath("/rma/vendors");
}

export async function createVendorAction(formData: FormData) {
  if (!(await mayManage())) return { error: "Anda tidak punya akses untuk mengelola vendor." };
  const v = readVendor(formData);
  const problem = invalid(v);
  if (problem) return { error: problem };
  try {
    const vendor = await db.vendor.create({ data: v, select: { id: true, name: true } });
    revalidateVendorPages();
    return { success: true, vendor };
  } catch (err) {
    if (duplicate(err)) return { error: `Vendor "${v.name}" sudah ada di daftar. Ubah perannya di sana.` };
    throw err;
  }
}

export async function updateVendorAction(id: string, formData: FormData) {
  if (!(await mayManage())) return { error: "Anda tidak punya akses untuk mengelola vendor." };
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
  revalidateVendorPages();
  return { success: true };
}
