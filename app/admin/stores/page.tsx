import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { Plus, Store, Ticket, Users } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteStoreAction } from "@/app/actions/stores";
import { DeleteEntryButton } from "@/components/app/DeleteEntryButton";

export const metadata = { title: "Store Locations — HNS IT Center" };

export default async function StoresPage() {
  await requireRole("Administrator", "Sales");

  const stores = await db.storeLocation.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { tickets: true, technician_stores: true } },
    },
  });

  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-stores" className="flex flex-col gap-6">
      <PageHeader
        title="Store Locations"
        description="Manage operational store locations and technician assignments"
        actions={
          <Link href="/admin/stores/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Add Store
          </Link>
        }
      />

      {stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No stores yet"
          description="Add your first store location to get started."
          action={
            <Link href="/admin/stores/create" className={buttonVariants({ variant: "outline" })}>
              <Plus aria-hidden="true" /> Add Store
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <li
              key={store.id}
              // The card is not one big link any more: it holds a delete
              // button, and a button inside a link is not valid. The link
              // stretches over the card through its ::after instead.
              className="relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:border-primary/40 hover:shadow-md"
            >
              <Link
                href={`/admin/stores/${store.id}`}
                aria-label={`Kelola ${store.name}`}
                className="flex flex-1 flex-col gap-3 outline-none after:absolute after:inset-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Store aria-hidden="true" className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-lg font-bold text-foreground">{store.name}</span>
                      <span className="w-fit rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                        {store.code}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      store.is_active
                        ? "border-tone-green-border bg-tone-green-bg text-tone-green-fg"
                        : "border-tone-red-border bg-tone-red-bg text-tone-red-fg",
                    )}
                  >
                    {store.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {store.address && <p className="line-clamp-1 text-sm text-muted-foreground">{store.address}</p>}

                <div className="mt-auto flex gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users aria-hidden="true" className="size-3.5" />
                    {store._count.technician_stores} technician{store._count.technician_stores !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Ticket aria-hidden="true" className="size-3.5" />
                    {store._count.tickets} ticket{store._count.tickets !== 1 ? "s" : ""}
                  </span>
                </div>
              </Link>
              <div className="relative z-10 flex justify-end">
                <DeleteEntryButton
                  name={store.name}
                  what="toko"
                  onDelete={deleteStoreAction.bind(null, store.id)}
                  blockedReason={
                    store._count.tickets > 0
                      ? `Sudah punya ${store._count.tickets} tiket — nonaktifkan lewat halaman toko, jangan dihapus.`
                      : null
                  }
                  description={`Toko ${store.name} (${store.code}) dihapus permanen, beserta penugasan teknisinya. Ini tidak bisa dibatalkan.`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
