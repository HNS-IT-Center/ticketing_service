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
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
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
              className="card hover:shadow-md transition-shadow no-underline"
              style={{ textDecoration: "none" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Store size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{store.name}</div>
                    <div className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mt-0.5 inline-block">
                      {store.code}
                    </div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  store.is_active
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {store.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {store.address && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-1">{store.address}</p>
              )}

              <div className="flex gap-4 text-sm text-gray-600 border-t border-gray-100 pt-3 mt-2">
                <span className="flex items-center gap-1">
                  <Users size={14} className="text-gray-400" />
                  {store._count.technician_stores} technician{store._count.technician_stores !== 1 ? "s" : ""}
                </span>
                <span>
                  🎫 {store._count.tickets} ticket{store._count.tickets !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
