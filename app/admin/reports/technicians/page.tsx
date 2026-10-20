import { Target, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { formatRupiah } from "@/lib/charges";
import { summarizeTargets } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { resolveReportMonth } from "@/lib/reports/parts-data";

export const metadata = { title: "Target Teknisi — HNS IT Center" };

export default async function TechnicianTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;
  const month = resolveReportMonth(params.month);
  const storeId = params.store || null;

  const [stores, data] = await Promise.all([
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadTargetData(month, storeId),
  ]);
  const summary = summarizeTargets(data?.technicians ?? [], data?.doneTickets ?? [], data?.lines ?? []);
  const { totals } = summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          <Target size={22} /> Target Teknisi
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Pekerjaan tiket service yang <strong>pertama kali selesai (Done)</strong> di bulan ini, dikreditkan ke
          teknisi tiketnya. Jasa dihitung dari Daftar Jasa: berapa kali dikerjakan, omzetnya (harga jual ×
          jumlah), dan poinnya. Poin di sini ukuran target sendiri, tidak masuk Leaderboard.
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Bulan</span>
          <input type="month" name="month" defaultValue={month} className="form-input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Toko</span>
          <select name="store" defaultValue={storeId ?? ""} className="form-input">
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          Tampilkan
        </button>
      </form>

      <div className="admin-stats-grid">
        <Stat value={totals.tickets} label="Tiket service selesai" />
        <Stat value={totals.jobs} label="Jasa dikerjakan" />
        <Stat value={formatRupiah(totals.revenue)} label="Omzet jasa" />
        <Stat value={totals.points} label="Poin jasa" />
      </div>

      {(totals.unpriced > 0 || totals.untyped > 0) && (
        <div className="card flex flex-col gap-1.5 text-sm" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
          {totals.unpriced > 0 && (
            <p className="m-0 flex items-center gap-1.5" style={{ color: "#92400e" }}>
              <AlertTriangle size={14} /> {totals.unpriced} baris jasa belum ada harga jual — omzet di bawah belum lengkap.
            </p>
          )}
          {totals.untyped > 0 && (
            <p className="m-0 flex items-center gap-1.5" style={{ color: "#92400e" }}>
              <AlertTriangle size={14} /> {totals.untyped} jasa masih diketik bebas (sebelum Daftar Jasa) — terhitung sebagai
              pekerjaan, tapi tidak per jenis dan tanpa poin.
            </p>
          )}
        </div>
      )}

      <div className="card flex flex-col gap-3">
        <h3 style={{ margin: 0 }}>Per teknisi</h3>
        {summary.rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Belum ada teknisi aktif{storeId ? " di toko ini" : ""}.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Teknisi</th>
                  <th>Tiket</th>
                  <th>Jasa</th>
                  <th>Omzet jasa</th>
                  <th>Poin</th>
                  <th>Rincian jasa</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.technician.id}>
                    <td style={{ fontWeight: 600 }}>{r.technician.name}</td>
                    <td>{r.tickets}</td>
                    <td>
                      {r.jobs}
                      {r.untyped > 0 && (
                        <span className="text-xs" style={{ color: "#92400e" }}>
                          {" "}
                          (+{r.untyped} diketik)
                        </span>
                      )}
                    </td>
                    <td>
                      {formatRupiah(r.revenue)}
                      {r.unpriced > 0 && (
                        <span className="text-xs" style={{ color: "#92400e" }}>
                          {" "}
                          ({r.unpriced} tanpa harga)
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.points}</td>
                    <td>
                      {r.byJob.length === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <details>
                          <summary style={{ cursor: "pointer" }}>{r.byJob.length} jenis jasa</summary>
                          <ul className="flex flex-col gap-0.5 text-sm" style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
                            {r.byJob.map((j) => (
                              <li key={j.jobId}>
                                {j.name} <strong>× {j.count}</strong>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card flex flex-col gap-3">
        <h3 style={{ margin: 0 }}>Jasa terbanyak</h3>
        {summary.jobs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Belum ada jasa dari Daftar Jasa pada periode ini.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Jasa</th>
                  <th>Dikerjakan</th>
                </tr>
              </thead>
              <tbody>
                {summary.jobs.map((j) => (
                  <tr key={j.jobId}>
                    <td>{j.name}</td>
                    <td style={{ fontWeight: 600 }}>{j.count}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
