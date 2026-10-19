import { Truck } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { NewVendorForm, VendorRow } from "./VendorForms";

export const metadata = { title: "Daftar Vendor — HNS IT Center" };

export default async function VendorsPage() {
  await requireRole("Administrator");
  const vendors = await db.vendor.findMany({
    orderBy: [{ is_active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, contact: true, is_active: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          <Truck size={22} /> Daftar Vendor
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Supplier part dan service eksternal (mis. perbaikan IC). Dipilih dari daftar saat
          mencatat biaya service, supaya satu vendor tidak tercatat dengan beberapa ejaan.
        </p>
      </div>

      <NewVendorForm />

      <div className="card p-4">
        {vendors.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Belum ada vendor.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Nama</th><th>Jenis</th><th>Kontak</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <VendorRow key={v.id} vendor={v} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
