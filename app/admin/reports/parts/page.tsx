import Link from "next/link";
import type { ServicePart } from "@prisma/client";
import { Download, Package } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { servicePartLabel } from "@/lib/service-parts";
import { summarizeParts } from "@/lib/reports/parts";
import { loadPartRows, resolveReportMonth } from "@/lib/reports/parts-data";

export const metadata = { title: "Laporan Pergantian Part — HNS IT Center" };

/** Detail rows shown on screen; the CSV export always carries all of them. */
const DETAIL_LIMIT = 300;

export default async function PartsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;
  const month = resolveReportMonth(params.month);
  const storeId = params.store || null;

  const [stores, rows] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadPartRows(month, storeId),
  ]);
  const data = rows ?? [];
  const summary = summarizeParts(data);
  const exportHref = `/admin/reports/parts/export?month=${month}${storeId ? `&store=${storeId}` : ""}`;
  const catalogShare = summary.entries ? Math.round((summary.fromCatalog / summary.entries) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2">
            <Package size={22} /> Laporan Pergantian Part
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Part yang dicatat teknisi di tiket service. Barang diambil dari katalog Accurate
            (data.hnsitcenter.id); laporan ini tidak mengubah stok di Accurate.
          </p>
        </div>
        <a href={exportHref} className="btn btn-secondary flex items-center gap-2">
          <Download size={16} /> Ekspor CSV
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Bulan</span>
          <input type="month" name="month" defaultValue={month} className="form-input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Toko</span>
          <select name="store" defaultValue={storeId ?? ""} className="form-input">
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Tampilkan</button>
      </form>

      <div className="admin-stats-grid">
        <Stat value={summary.quantity} label="Total part dipasang" />
        <Stat value={summary.entries} label="Catatan" />
        <Stat value={summary.tickets} label="Tiket" />
        <Stat value={`${catalogShare}%`} label={`Dari katalog (${summary.fromCatalog}/${summary.entries})`} />
      </div>

      {data.length === 0 ? (
        <div className="card p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Belum ada part yang dicatat pada periode ini.
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="card flex flex-col gap-3 p-4">
              <h3>Per jenis part</h3>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Jenis</th><th>Jumlah</th><th>Catatan</th></tr></thead>
                  <tbody>
                    {summary.byPart.map((p) => (
                      <tr key={p.part}>
                        <td>{servicePartLabel(p.part as ServicePart)}</td>
                        <td style={{ fontWeight: 700 }}>{p.quantity}</td>
                        <td>{p.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card flex flex-col gap-3 p-4">
              <h3>Per teknisi</h3>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Teknisi</th><th>Jumlah</th><th>Catatan</th></tr></thead>
                  <tbody>
                    {summary.byTechnician.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td style={{ fontWeight: 700 }}>{t.quantity}</td>
                        <td>{t.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="card flex flex-col gap-3 p-4">
            <h3>Per barang</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Barang</th><th>SKU</th><th>Kategori Accurate</th><th>Jumlah</th><th>Tiket</th></tr></thead>
                <tbody>
                  {summary.byItem.map((i) => (
                    <tr key={i.key}>
                      <td style={{ fontWeight: 600 }}>{i.label}</td>
                      <td>{i.sku ?? <span style={{ color: "var(--text-muted)" }}>manual</span>}</td>
                      <td>{i.category ?? "—"}</td>
                      <td style={{ fontWeight: 700 }}>{i.quantity}</td>
                      <td>{i.tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card flex flex-col gap-3 p-4">
            <h3>Rincian</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Tanggal</th><th>Tiket</th><th>Toko</th><th>Teknisi</th><th>Jenis</th><th>Barang</th><th>SKU</th><th>Jml</th></tr>
                </thead>
                <tbody>
                  {data.slice(0, DETAIL_LIMIT).map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>{formatDateTime(r.createdAt)}</td>
                      <td><Link href={`/admin/tickets/${r.ticketId}`} style={{ color: "var(--primary)", fontWeight: 600 }}>{r.ticketCode}</Link></td>
                      <td>{r.storeName ?? "—"}</td>
                      <td>{r.technicianName}</td>
                      <td>{servicePartLabel(r.part as ServicePart)}</td>
                      <td>{r.itemName ?? "—"}</td>
                      <td>{r.sku ?? "—"}</td>
                      <td style={{ fontWeight: 700 }}>{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.length > DETAIL_LIMIT && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Menampilkan {DETAIL_LIMIT} dari {data.length} catatan. Ekspor CSV untuk semuanya.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  );
}
