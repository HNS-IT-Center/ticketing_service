import { db } from "@/lib/db";
import { isCatalogConfigured } from "@/lib/catalog/hns-data";
import { PageHeader } from "@/components/app/PageHeader";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import QuickTicketForm from "./QuickTicketForm";

/**
 * The one-page Buat Tiket form with its data — shared by the technician and
 * admin portals. The caller checks who may open it; the wizard at
 * `oldFormHref` stays available.
 */
export default async function QuickCreate({ userId, oldFormHref }: { userId: string; oldFormHref: string }) {
  const [storeLocations, technicians, sales, upgrades, myStores, me] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { role: "Technician", is_active: true },
      select: { id: true, name: true, store_assignments: { select: { store_id: true } } },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { role: "Sales", is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.upgrade.findMany({ select: { id: true, name: true } }),
    db.technicianStoreAssignment.findMany({
      where: { technician_id: userId, store: { is_active: true } },
      select: { store: { select: { id: true, name: true } } },
      orderBy: { store: { name: "asc" } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  return (
    <div data-slot="quick-create-page" className="flex flex-col gap-4">
      <PageHeader
        title="Buat Tiket"
        description="Satu halaman: pekerjaan, unit, keluhan, pelanggan, penanganan."
        actions={
          <Link href={oldFormHref} className={buttonVariants({ variant: "outline" })}>
            Pakai form lama
          </Link>
        }
      />
      <QuickTicketForm
        storeLocations={storeLocations}
        technicians={technicians}
        sales={sales}
        upgrades={upgrades}
        myStores={myStores.map((a) => a.store)}
        currentUserId={userId}
        currentUserName={me?.name ?? ""}
        catalogEnabled={isCatalogConfigured()}
      />
    </div>
  );
}
