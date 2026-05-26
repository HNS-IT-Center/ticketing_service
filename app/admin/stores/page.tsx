import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { Plus, Store, Users, ToggleLeft, ToggleRight } from "lucide-react";

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Locations</h1>
          <p className="text-gray-500 text-sm mt-1">Manage operational store locations and technician assignments</p>
        </div>
        <Link
          href="/admin/stores/create"
          className="btn btn-primary"
        >
          <Plus size={16} />
          Add Store
        </Link>
      </div>

      {stores.length === 0 ? (
        <div className="card text-center py-16">
          <Store size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">No stores yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first store location to get started.</p>
          <Link href="/admin/stores/create" className="inline-block mt-4 text-indigo-600 font-medium text-sm hover:underline">
            + Add Store
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/admin/stores/${store.id}`}
              className="card hover:shadow-md transition-shadow flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Store size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-lg">{store.name}</div>
                    <div className="badge bg-[var(--cream-dark)] text-[var(--text-secondary)] mt-1">
                      {store.code}
                    </div>
                  </div>
                </div>
                <span className={`badge ${store.is_active ? "badge-done" : "badge-cancelled"}`}>
                  {store.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {store.address && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-1">{store.address}</p>
              )}

              <div className="flex-1"></div>
              <div className="flex gap-4 mt-6 border-t border-gray-100 text-sm text-gray-600 pt-4">
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  {store._count.technician_stores} technician{store._count.technician_stores !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                  {store._count.tickets} ticket{store._count.tickets !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
