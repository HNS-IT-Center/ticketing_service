import Link from "next/link";
import type { ServicePart } from "@prisma/client";
import { Download, Package, TrendingUp, PackageX, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { servicePartLabel } from "@/lib/service-parts";
import { monthLabel, summarizeParts } from "@/lib/reports/parts";
import { loadPartRows, loadPartRowsBetween, resolveReportMonth } from "@/lib/reports/parts-data";
import {
  DEMAND_MONTHS,
  STOCK_HINT_MIN_USES,
  demandWindow,
  outsideCatalog,
  rankCatalogDemand,
  worthStocking,
  type DemandRow,
} from "@/lib/reports/part-demand";
import { CatalogUnavailableError, getCatalogItem, isCatalogConfigured } from "@/lib/catalog/hns-data";
import { stockAtStore, type StoreRef } from "@/lib/catalog/items";

export const metadata = { title: "Laporan Pergantian Part — HNS IT Center" };

/** Detail rows shown on screen; the CSV export always carries all of them. */
const DETAIL_LIMIT = 300;
/** Items whose stock is looked up in the catalogue — one API call each. */
const DEMAND_LIMIT = 15;

type StockNow = { here: number | null; total: number };

/**
 * What the catalogue holds now for the most-used items. One lookup each, in
 * parallel; a lookup that fails shows as unknown rather than failing the page.
 */
async function stockFor(rows: DemandRow[], store: StoreRef | null): Promise<{ stock: Map<string, StockNow>; unavailable: boolean }> {
  const stock = new Map<string, StockNow>();
  if (!isCatalogConfigured()) return { stock, unavailable: true };
  let unavailable = false;
  await Promise.all(
    rows.map(async (r) => {
      if (!r.catalogItemId) return;
      try {
        const item = await getCatalogItem(r.catalogItemId);
        if (item) stock.set(r.sku, { here: stockAtStore(item, store), total: item.stockTotal });
      } catch (err) {
        if (!(err instanceof CatalogUnavailableError)) throw err;
        unavailable = true;
      }
    })
  );
  return { stock, unavailable };
}

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
    db.storeLocation.findMany({ where: { is_active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    loadPartRows(month, storeId),
  ]);
  const data = rows ?? [];
  const summary = summarizeParts(data);

  // What to stock: the last few months, not just the one on screen.
  const span = demandWindow(month)!;
  const demandRows = await loadPartRowsBetween(span.start, span.end, storeId);
  const demand = rankCatalogDemand(demandRows).slice(0, DEMAND_LIMIT);
  const outside = outsideCatalog(demandRows);
  const store = storeId ? (stores.find((s) => s.id === storeId) ?? null) : null;
  const storeName = store?.name ?? null;
  const { stock, unavailable: stockUnavailable } = await stockFor(demand, store);
  const windowLabel = `${monthLabel(span.firstMonth)} – ${monthLabel(month)}`;
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

      <section className="card flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
            <TrendingUp size={18} /> Sering dipakai — {windowLabel}
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Barang dari katalog Accurate yang paling sering dipasang dalam {DEMAND_MONTHS} bulan terakhir
            {storeName ? ` di ${storeName}` : ""}, dengan stok sekarang. Dipakai minimal {STOCK_HINT_MIN_USES}× dan
            stoknya kosong ditandai — bahan pertimbangan untuk distok, bukan pesanan otomatis.
          </p>
          {stockUnavailable && (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: "#92400e", margin: 0 }}>
              <AlertTriangle size={12} /> Stok sebagian barang tidak bisa diambil dari katalog saat ini.
            </p>
          )}
        </div>
        {demand.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Belum ada part dari katalog yang dipasang pada periode ini.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Barang</th>
                  <th>SKU</th>
                  <th>Dipakai</th>
                  <th>Unit</th>
                  <th>Bulan</th>
                  <th>Stok sekarang</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {demand.map((d) => {
                  const s = stock.get(d.sku);
                  const decisive = s ? (storeName && s.here !== null ? s.here : s.total) : null;
                  return (
                    <tr key={d.sku}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td>{d.sku}</td>
                      <td style={{ fontWeight: 700 }}>{d.uses}×</td>
                      <td>{d.quantity}</td>
                      <td>
                        {d.months}/{DEMAND_MONTHS}
                      </td>
                      <td>
                        {!s ? (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        ) : storeName ? (
                          <>
                            {s.here ?? "—"} <span style={{ color: "var(--text-muted)" }}>(total {s.total})</span>
                          </>
                        ) : (
                          s.total
                        )}
                      </td>
                      <td>
                        {worthStocking(d, decisive) && (
                          <span
                            className="whitespace-nowrap rounded-full text-xs font-bold"
                            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "0.1rem 0.6rem" }}
                          >
                            Pertimbangkan stok
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
            <PackageX size={18} /> Di luar katalog Accurate — {windowLabel}
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Part yang diketik manual karena tidak ada di katalog, atau barangnya belum diterima di Accurate. Begitu
            kodenya ada, masukkan lewat &ldquo;Masukkan kode&rdquo; di Rincian Biaya tiketnya dan part itu keluar dari
            daftar ini. Yang sering muncul tanpa kode layak ditambahkan ke Accurate.
          </p>
        </div>
        {outside.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)", margin: 0 }}>
            Semua part pada periode ini dipilih dari katalog.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Nama yang diketik</th>
                  <th>Dipakai</th>
                  <th>Unit</th>
                  <th>Tiket</th>
                </tr>
              </thead>
              <tbody>
                {outside.map((o) => (
                  <tr key={`${o.part}:${o.name}`}>
                    <td>{servicePartLabel(o.part as ServicePart)}</td>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td style={{ fontWeight: 700 }}>{o.uses}×</td>
                    <td>{o.quantity}</td>
                    <td>
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {o.tickets.map((t) => (
                          <Link key={t.id} href={`/admin/tickets/${t.id}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
                            {t.code}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
