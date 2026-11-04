import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import type { VendorRoles } from "@/lib/vendors";
import { NewVendorForm, VendorRow } from "./VendorForms";

/**
 * The vendor list, as both the admin and the RMA portal show it. The caller
 * guards the page and says whether this viewer may change it.
 */
export default async function VendorDirectory({
  canManage,
  defaultRoles,
}: {
  canManage: boolean;
  /** Roles ticked in advance on the add form — claims on the RMA desk. */
  defaultRoles?: Partial<VendorRoles>;
}) {
  const vendors = await db.vendor.findMany({
    orderBy: [{ is_active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      contact: true,
      is_active: true,
      supplies_parts: true,
      repairs: true,
      handles_claims: true,
      location: true,
      _count: { select: { charges: true, rma_cases: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          <Truck size={22} /> Daftar Vendor
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Supplier part, service eksternal (mis. perbaikan IC) dan vendor klaim garansi. Satu vendor bisa
          punya beberapa peran. Vendor dipilih dari daftar ini saat mencatat biaya service dan saat
          mengajukan klaim, supaya satu vendor tidak tercatat dengan beberapa ejaan.
        </p>
      </div>

      {canManage && <NewVendorForm defaultRoles={defaultRoles} />}

      <div className="card">
        {vendors.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada vendor.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Peran</th>
                  <th>Lokasi</th>
                  <th>Kontak</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(({ _count, ...v }) => (
                  <VendorRow key={v.id} vendor={{ ...v, charges: _count.charges, cases: _count.rma_cases }} canManage={canManage} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
