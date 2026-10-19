"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type VendorKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { accessFor } from "@/lib/access-server";

const KINDS: VendorKind[] = ["part_supplier", "repair_service", "both"];

function readVendor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kind = String(formData.get("kind") ?? "part_supplier") as VendorKind;
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  return { name, kind, contact, notes };
}

async function mayManage(): Promise<boolean> {
  const session = await requireSession();
  return (await accessFor(session.userId)).can("manage_vendors");
}

function duplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createVendorAction(formData: FormData) {
  if (!(await mayManage())) return { error: "Anda tidak punya akses untuk mengelola vendor." };
  const v = readVendor(formData);
  if (v.name.length < 2) return { error: "Nama vendor minimal 2 karakter." };
  if (!KINDS.includes(v.kind)) return { error: "Jenis vendor tidak dikenal." };
  try {
    const vendor = await db.vendor.create({ data: v, select: { id: true, name: true, kind: true } });
    revalidatePath("/admin/vendors");
    return { success: true, vendor };
  } catch (err) {
    if (duplicate(err)) return { error: `Vendor "${v.name}" sudah ada di daftar.` };
    throw err;
  }
}

export async function updateVendorAction(id: string, formData: FormData) {
  if (!(await mayManage())) return { error: "Anda tidak punya akses untuk mengelola vendor." };
  const v = readVendor(formData);
  if (v.name.length < 2) return { error: "Nama vendor minimal 2 karakter." };
  if (!KINDS.includes(v.kind)) return { error: "Jenis vendor tidak dikenal." };
  const is_active = formData.get("is_active") === "1";
  try {
    await db.vendor.update({ where: { id }, data: { ...v, is_active } });
  } catch (err) {
    if (duplicate(err)) return { error: `Vendor "${v.name}" sudah ada di daftar.` };
    throw err;
  }
  revalidatePath("/admin/vendors");
  return { success: true };
}
