import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { deleteServiceJobAction } from "@/app/actions/service-jobs";
import { DeleteEntryButton } from "@/components/app/DeleteEntryButton";
import { formatRupiah } from "@/lib/charges";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import {
  AccurateItemCell,
  ApplyAccurateItemForm,
  NewServiceJobForm,
  ServiceJobEditDialog,
  type ServiceJobRowData,
} from "./ServiceJobForms";

/**
 * The Daftar Jasa, as the admin and the technician portal show it. The caller
 * guards the page and says whether this viewer may change it.
 */
export default async function ServiceJobDirectory({ canManage }: { canManage: boolean }) {
  const jobs = await db.serviceJob.findMany({
    orderBy: [{ is_active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      default_price: true,
      points: true,
      is_active: true,
      accurate_sku: true,
      accurate_name: true,
      _count: { select: { charges: true } },
    },
  });

  const rows: ServiceJobRowData[] = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    default_price: j.default_price,
    points: j.points,
    is_active: j.is_active,
    used: j._count.charges,
    accurate_sku: j.accurate_sku,
    accurate_name: j.accurate_name,
  }));

  const columns: DataTableColumn<ServiceJobRowData>[] = [
    { key: "name", header: "Jasa", mobile: "title", cell: (j) => <span className="font-semibold">{j.name}</span> },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (j) => (
        <span
          className={
            j.is_active
              ? "rounded-full border border-tone-green-border bg-tone-green-bg px-2 py-0.5 text-xs font-semibold text-tone-green-fg"
              : "rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
          }
        >
          {j.is_active ? "Aktif" : "Nonaktif"}
        </span>
      ),
    },
    {
      key: "price",
      header: "Harga default",
      className: "whitespace-nowrap",
      cell: (j) => (j.default_price === null ? <span className="text-muted-foreground">—</span> : formatRupiah(j.default_price)),
    },
    { key: "points", header: "Poin", cell: (j) => j.points },
    { key: "accurate", header: "Kode Accurate", cell: (j) => <AccurateItemCell job={j} canManage={canManage} /> },
    { key: "used", header: "Dipakai", cell: (j) => <span className="text-muted-foreground">{j.used}×</span> },
    ...(canManage
      ? [
          {
            key: "edit",
            header: "",
            mobile: "footer" as const,
            cell: (j: ServiceJobRowData) => (
              <span className="flex items-center justify-end gap-2">
                <ServiceJobEditDialog job={j} />
                <DeleteEntryButton
                  name={j.name}
                  what="jasa"
                  onDelete={deleteServiceJobAction.bind(null, j.id)}
                  blockedReason={j.used > 0 ? `Sudah dipakai ${j.used}× di tagihan — nonaktifkan lewat Ubah, jangan dihapus.` : null}
                />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="service-job-directory" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ClipboardList aria-hidden="true" className="size-6" /> Daftar Jasa
          </span>
        }
        description="Jasa yang dikerjakan teknisi, dipilih dari daftar ini di Rincian Biaya, bukan diketik. Dari sini target teknisi dihitung: berapa kali tiap jasa dikerjakan, omzetnya, dan poinnya. Harga default langsung terisi di tagihan dan masih bisa diubah oleh yang punya akses harga jual."
      />

      {canManage && <NewServiceJobForm />}
      {canManage && <ApplyAccurateItemForm unmapped={rows.filter((j) => !j.accurate_sku).length} />}

      <DataTable
        caption="Daftar Jasa"
        columns={columns}
        rows={rows}
        getRowKey={(j) => j.id}
        // An inactive job stays listed, dimmed, as before.
        rowClassName={(j) => (j.is_active ? undefined : "opacity-55")}
        empty={<EmptyState icon={ClipboardList} title="Belum ada jasa." />}
      />
    </div>
  );
}
