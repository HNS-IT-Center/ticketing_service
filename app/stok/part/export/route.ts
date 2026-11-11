import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { loadOutgoingParts } from "@/lib/stock-server";
import { OUTGOING_KIND_LABELS } from "@/lib/stock";
import { readOutgoingSearch, type OutgoingSearch } from "@/lib/stock-filter";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";

/**
 * GET /stok/part/export — Part Keluar under the same filters, every page, as
 * .xlsx. Admin Stok and administrators; the handler checks the session itself
 * rather than relying on the proxy.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "StockAdmin" && session.role !== "Administrator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const search = Object.fromEntries(new URL(request.url).searchParams) as OutgoingSearch;
  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true } });
  const p = readOutgoingSearch(search, stores.map((s) => s.id), Date.now());
  const rows = await loadOutgoingParts({ start: p.period.start, end: p.period.end, storeId: p.storeId, kind: p.kind, q: p.q, uncoded: p.uncoded });

  const file = buildXlsx({
    name: "Part Keluar",
    columns: [
      { header: "Tanggal", width: 18 },
      { header: "Jenis", width: 20 },
      { header: "Kategori", width: 18 },
      { header: "Nama Barang", width: 48 },
      { header: "Kode Accurate", width: 16 },
      { header: "Jumlah", width: 8 },
      { header: "Kode Tiket", width: 14 },
      { header: "Toko", width: 18 },
      { header: "Teknisi", width: 18 },
      { header: "Jumlah Foto", width: 11 },
    ],
    rows: rows.map((r) => [
      r.at,
      OUTGOING_KIND_LABELS[r.kind],
      r.category,
      r.name,
      r.sku ?? "",
      r.quantity,
      r.code,
      r.store ?? "",
      r.technician ?? "",
      r.photos.length,
    ]),
  });
  await logActivity(session, "export.parts", `Mengekspor ${rows.length} baris part keluar (${p.period.label}) ke Excel.`);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="part-keluar_${p.period.fromDay}_${p.period.toDay}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
