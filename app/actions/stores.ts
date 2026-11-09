"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { logActivity } from "@/lib/activity";

// ─── Create Store ─────────────────────────────────────────────────────────────
export async function createStoreAction(formData: FormData) {
  const session = await requireRole("Administrator");

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

  const store = await db.storeLocation.create({ data: { name, code, address }, select: { id: true } });
  await logActivity(session, "store.create", `Menambah toko ${name} (${code}).`, {
    type: "store",
    id: store.id,
    label: `${name} (${code})`,
  });

  revalidatePath("/admin/stores");
  return { success: true };
}

// ─── Update Store ─────────────────────────────────────────────────────────────
export async function updateStoreAction(storeId: string, formData: FormData) {
  const session = await requireRole("Administrator");

  const name = (formData.get("name") as string).trim();
  const address = (formData.get("address") as string | null)?.trim() || null;
  const is_active = formData.get("is_active") === "1";

  await db.storeLocation.update({
    where: { id: storeId },
    data: { name, address, is_active },
  });
  await logActivity(session, "store.update", `Mengubah toko ${name} (${is_active ? "aktif" : "nonaktif"}).`, {
    type: "store",
    id: storeId,
    label: name,
  });

  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Delete Store ─────────────────────────────────────────────────────────────
export async function deleteStoreAction(storeId: string) {
  const session = await requireRole("Administrator");

  // Check if any tickets reference this store before deleting
  const ticketCount = await db.ticket.count({
    where: { store_location_id: storeId },
  });
  if (ticketCount > 0)
    return {
      error: `Cannot delete — ${ticketCount} ticket(s) are linked to this store. Deactivate it instead.`,
    };

  const store = await db.storeLocation.delete({ where: { id: storeId }, select: { name: true, code: true } });
  await logActivity(session, "store.delete", `Menghapus toko ${store.name} (${store.code}).`, {
    type: "store",
    id: storeId,
    label: `${store.name} (${store.code})`,
  });

  revalidatePath("/admin/stores");
  return { success: true };
}

// ─── Assign Technician to Store ───────────────────────────────────────────────
export async function assignTechnicianToStoreAction(
  technicianId: string,
  storeId: string
) {
  const session = await requireRole("Administrator");

  await db.technicianStoreAssignment.upsert({
    where: { technician_id_store_id: { technician_id: technicianId, store_id: storeId } },
    create: { technician_id: technicianId, store_id: storeId },
    update: {},
  });
  await logStoreAssignment(session, "store.assign", technicianId, storeId);

  revalidatePath(`/admin/users/${technicianId}`);
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Remove Technician from Store ─────────────────────────────────────────────
export async function removeTechnicianFromStoreAction(
  technicianId: string,
  storeId: string
) {
  const session = await requireRole("Administrator");

  await db.technicianStoreAssignment.deleteMany({
    where: { technician_id: technicianId, store_id: storeId },
  });
  await logStoreAssignment(session, "store.unassign", technicianId, storeId);

  revalidatePath(`/admin/users/${technicianId}`);
  revalidatePath(`/admin/stores/${storeId}`);
  return { success: true };
}

// ─── Kepala toko (StoreSupervisor) of a store ────────────────────────────────
/** Puts a kepala toko on a store. Only an account with that role can be one. */
export async function assignSupervisorToStoreAction(userId: string, storeId: string) {
  const session = await requireRole("Administrator");
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
  if (!user || user.role !== "StoreSupervisor") return { error: "Akun ini bukan kepala toko. Ubah role-nya di halaman Users." };
  const store = await db.storeLocation.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) return { error: "Toko tidak ditemukan." };

  await db.storeSupervisorAssignment.upsert({
    where: { user_id_store_id: { user_id: userId, store_id: storeId } },
    create: { user_id: userId, store_id: storeId },
    update: {},
  });
  await logActivity(session, "store.supervisor_assign", `Menjadikan ${user.name} kepala toko ${store.name}.`, {
    type: "store",
    id: storeId,
    label: store.name,
  });
  revalidatePath(`/admin/stores/${storeId}`);
  revalidatePath("/toko/dashboard");
  return { success: true };
}

export async function removeSupervisorFromStoreAction(userId: string, storeId: string) {
  const session = await requireRole("Administrator");
  const [user, store] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.storeLocation.findUnique({ where: { id: storeId }, select: { name: true } }),
  ]);
  await db.storeSupervisorAssignment.deleteMany({ where: { user_id: userId, store_id: storeId } });
  await logActivity(
    session,
    "store.supervisor_unassign",
    `Melepas ${user?.name ?? "kepala toko"} dari toko ${store?.name ?? "toko"}.`,
    { type: "store", id: storeId, label: store?.name ?? "toko" },
  );
  revalidatePath(`/admin/stores/${storeId}`);
  revalidatePath("/toko/dashboard");
  return { success: true };
}

async function logStoreAssignment(
  session: { userId: string; name: string; role: string },
  action: "store.assign" | "store.unassign",
  technicianId: string,
  storeId: string,
) {
  const [tech, store] = await Promise.all([
    db.user.findUnique({ where: { id: technicianId }, select: { name: true } }),
    db.storeLocation.findUnique({ where: { id: storeId }, select: { name: true } }),
  ]);
  const who = tech?.name ?? "teknisi";
  const where = store?.name ?? "toko";
  await logActivity(
    session,
    action,
    action === "store.assign" ? `Menugaskan ${who} ke toko ${where}.` : `Melepas ${who} dari toko ${where}.`,
    { type: "store", id: storeId, label: where },
  );
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
