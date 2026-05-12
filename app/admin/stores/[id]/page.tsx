import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import StoreEditForm from "./StoreEditForm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await db.storeLocation.findUnique({ where: { id }, select: { name: true } });
  return { title: `${store?.name ?? "Store"} — HNS IT Center` };
}

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("Administrator", "Sales");

  const [store, allTechnicians] = await Promise.all([
    db.storeLocation.findUnique({
      where: { id },
      include: {
        technician_stores: {
          include: { technician: { select: { id: true, name: true, shift: true } } },
          orderBy: { assigned_at: "asc" },
        },
        _count: { select: { tickets: true } },
      },
    }),
    db.user.findMany({
      where: { role: "Technician" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!store) notFound();

  return <StoreEditForm store={store} allTechnicians={allTechnicians} />;
}
