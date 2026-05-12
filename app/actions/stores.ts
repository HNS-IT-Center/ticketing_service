"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

// ─── Create Store ─────────────────────────────────────────────────────────────
export async function createStoreAction(formData: FormData) {
  await requireRole("Administrator");

  const name = (formData.get("name") as string).trim();
  const code = (formData.get("code") as string).trim().toUpperCase();
  const address = (formData.get("address") as string | null)?.trim() || null;

  if (!name || !code) return { error: "Name and code are required" };
  if (!/^[A-Z0-9]{2,6}$/.test(code))
    return { error: "Code must be 2–6 uppercase letters/numbers (e.g. NGW)" };

  const existing = await db.storeLocation.findFirst({
    where: { OR: [{ name }, { code }] },
  });
  if (existing)
    return { error: "A store with this name or code already exists" };

  await db.storeLocation.create({ data: { name, code, address } });

  revalidatePath("/admin/stores");
  return { success: true };
}

// ─── Update Store ─────────────────────────────────────────────────────────────
export async function updateStoreAction(storeId: string, formData: FormData) {
  await requireRole("Administrator");

  const name = (formData.get("name") as string).trim();
  const address = (formData.get("address") as string | null)?.trim() || null;
  const is_active = formData.get("is_active") === "1";

  await db.storeLocation.update({
    where: { id: storeId },
    data: { name, address, is_active },
  });

  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Delete Store ─────────────────────────────────────────────────────────────
export async function deleteStoreAction(storeId: string) {
  await requireRole("Administrator");

  // Check if any tickets reference this store before deleting
  const ticketCount = await db.ticket.count({
    where: { store_location_id: storeId },
  });
  if (ticketCount > 0)
    return {
      error: `Cannot delete — ${ticketCount} ticket(s) are linked to this store. Deactivate it instead.`,
    };

  await db.storeLocation.delete({ where: { id: storeId } });

  revalidatePath("/admin/stores");
  return { success: true };
}

// ─── Assign Technician to Store ───────────────────────────────────────────────
export async function assignTechnicianToStoreAction(
  technicianId: string,
  storeId: string
) {
  await requireRole("Administrator");

  await db.technicianStoreAssignment.upsert({
    where: { technician_id_store_id: { technician_id: technicianId, store_id: storeId } },
    create: { technician_id: technicianId, store_id: storeId },
    update: {},
  });

  revalidatePath(`/admin/users/${technicianId}`);
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Remove Technician from Store ─────────────────────────────────────────────
export async function removeTechnicianFromStoreAction(
  technicianId: string,
  storeId: string
) {
  await requireRole("Administrator");

  await db.technicianStoreAssignment.deleteMany({
    where: { technician_id: technicianId, store_id: storeId },
  });

  revalidatePath(`/admin/users/${technicianId}`);
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Get All Active Stores (for dropdowns) ────────────────────────────────────
export async function getActiveStoresAction() {
  const stores = await db.storeLocation.findMany({
    where: { is_active: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return stores;
}
