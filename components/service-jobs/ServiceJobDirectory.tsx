import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { ApplyAccurateItemForm, NewServiceJobForm, ServiceJobRow } from "./ServiceJobForms";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          <ClipboardList size={22} /> Daftar Jasa
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Jasa yang dikerjakan teknisi, dipilih dari daftar ini di Rincian Biaya, bukan diketik. Dari sini
          target teknisi dihitung: berapa kali tiap jasa dikerjakan, omzetnya, dan poinnya. Harga default
          langsung terisi di tagihan dan masih bisa diubah oleh yang punya akses harga jual.
        </p>
      </div>

      {canManage && <NewServiceJobForm />}
      {canManage && <ApplyAccurateItemForm unmapped={jobs.filter((j) => !j.accurate_sku).length} />}

      <div className="card">
        {jobs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada jasa.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Jasa</th>
                  <th>Harga default</th>
                  <th>Poin</th>
                  <th>Kode Accurate</th>
                  <th>Dipakai</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <ServiceJobRow
                    key={j.id}
                    job={{
                      id: j.id,
                      name: j.name,
                      default_price: j.default_price,
                      points: j.points,
                      is_active: j.is_active,
                      used: j._count.charges,
                      accurate_sku: j.accurate_sku,
                      accurate_name: j.accurate_name,
                    }}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
