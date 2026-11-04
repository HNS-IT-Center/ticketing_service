import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import type { VendorRoles } from "@/lib/vendors";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { LocationPill, NewVendorForm, RolePills, VendorRowActions, type VendorRowData } from "./VendorForms";

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
  const rows = await db.vendor.findMany({
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
  const vendors: VendorRowData[] = rows.map(({ _count, ...v }) => ({ ...v, charges: _count.charges, cases: _count.rma_cases }));

  const columns: DataTableColumn<VendorRowData>[] = [
    { key: "name", header: "Nama", mobile: "title", cell: (v) => <span className="font-semibold">{v.name}</span> },
    { key: "roles", header: "Peran", cell: (v) => <RolePills vendor={v} /> },
    { key: "location", header: "Lokasi", cell: (v) => <LocationPill location={v.location} /> },
    { key: "contact", header: "Kontak", cell: (v) => <span className="text-muted-foreground">{v.contact ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (v) => (
        <span
          className={
            v.is_active
              ? "rounded-full border border-tone-green-border bg-tone-green-bg px-2 py-0.5 text-xs font-semibold text-tone-green-fg"
              : "rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
          }
        >
          {v.is_active ? "Aktif" : "Nonaktif"}
        </span>
      ),
    },
    ...(canManage
      ? [{ key: "edit", header: "", mobile: "footer" as const, cell: (v: VendorRowData) => <VendorRowActions vendor={v} /> }]
      : []),
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="vendor-directory" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Truck aria-hidden="true" className="size-6" /> Daftar Vendor
          </span>
        }
        description="Supplier part, service eksternal (mis. perbaikan IC) dan vendor klaim garansi. Satu vendor bisa punya beberapa peran. Vendor dipilih dari daftar ini saat mencatat biaya service dan saat mengajukan klaim, supaya satu vendor tidak tercatat dengan beberapa ejaan."
      />

      {canManage && <NewVendorForm defaultRoles={defaultRoles} />}

      <DataTable
        caption="Daftar Vendor"
        columns={columns}
        rows={vendors}
        getRowKey={(v) => v.id}
        // An inactive vendor stays listed, dimmed, as before.
        rowClassName={(v) => (v.is_active ? undefined : "opacity-55")}
        empty={<EmptyState icon={Truck} title="Belum ada vendor." />}
      />
    </div>
  );
}
