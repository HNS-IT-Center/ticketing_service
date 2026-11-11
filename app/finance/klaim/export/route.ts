import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { loadStoreClaims, withUnitCosts } from "@/lib/finance-claims-server";
import { accessFor } from "@/lib/access-server";
import { CLAIM_STAGE_LABELS, readFinanceSearch, stageOfClaim, type FinanceSearch } from "@/lib/finance-filter";
import { rmaDecisionLabel } from "@/lib/rma/decision";
import { rmaStatusDisplay } from "@/lib/status-display";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/xlsx";

/**
 * GET /finance/klaim/export — Klaim Stok Toko under the same filters, every
 * page, as .xlsx. Finance and administrators; the handler checks the session
 * itself rather than relying on the proxy.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "Finance" && session.role !== "Administrator")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = Date.now();
  const search = Object.fromEntries(new URL(request.url).searchParams) as FinanceSearch;
  const stores = await db.storeLocation.findMany({ where: { is_active: true }, select: { id: true } });
  const p = readFinanceSearch(search, stores.map((s) => s.id), now);
  const seesCost = (await accessFor(session.userId)).can("view_cost");
  const loaded = (await loadStoreClaims({ storeId: p.storeId, q: p.q, createdStart: p.period.start, createdEnd: p.period.end }, now))
    .filter((r) => !p.vendorKey || r.vendorKey === p.vendorKey)
    .filter((r) => p.stage === "all" || stageOfClaim(r) === p.stage);
  const claims = seesCost ? (await withUnitCosts(loaded)).rows : loaded;

  const file = buildXlsx({
    name: "Klaim Stok Toko",
    columns: [
      { header: "Kode Tiket", width: 14 },
      { header: "Kode RMA", width: 20 },
      { header: "Toko", width: 18 },
      { header: "Tanggal Klaim", width: 16 },
      { header: "Brand", width: 12 },
      { header: "Unit", width: 44 },
      { header: "SKU", width: 14 },
      { header: "SN", width: 20 },
      { header: "Asal Stok", width: 20 },
      { header: "No. Pemindahan Stok", width: 20 },
      { header: "Vendor", width: 28 },
      { header: "Lokasi Vendor", width: 12 },
      { header: "No. Klaim Pemasok", width: 20 },
      { header: "Tahap RMA", width: 22 },
      { header: "Dikirim ke Vendor", width: 16 },
      { header: "Keputusan Vendor", width: 16 },
      { header: "Hasil", width: 16 },
      { header: "Unit Kembali", width: 16 },
      { header: "Ditutup", width: 16 },
      { header: "Lama di Vendor (hari)", width: 12 },
      { header: "Posisi", width: 22 },
      // Harga modal only for a viewer allowed it, as on screen.
      ...(seesCost
        ? [
            { header: "Harga Modal / Unit (HPP)", width: 18, format: "rupiah" as const },
            { header: "Uang Tertahan", width: 16, format: "rupiah" as const },
          ]
        : []),
    ],
    rows: claims.map((r) => [
      r.code,
      r.rmaCode ?? "",
      r.store ?? "",
      r.createdAt,
      r.brand ?? "",
      r.device,
      r.sku ?? "",
      r.sn ?? "",
      r.stockOrigin ?? "",
      r.transferNumber ?? "",
      r.vendorName ?? "",
      r.vendorLocation === "in_town" ? "LKL" : r.vendorLocation === "out_of_town" ? "ITR" : "",
      r.supplierClaimNumber ?? "",
      r.rmaStatus ? rmaStatusDisplay(r.rmaStatus).label : "Belum diserahkan ke RMA",
      r.submittedAt,
      r.decidedAt,
      r.decision ? rmaDecisionLabel(r.decision) : "",
      r.receivedAt,
      r.closedAt,
      r.span ? r.span.days : null,
      CLAIM_STAGE_LABELS[stageOfClaim(r)],
      ...(seesCost ? [r.unitCost, stageOfClaim(r) !== "back" ? r.unitCost : null] : []),
    ]),
  });
  await logActivity(session, "export.claims", `Mengekspor ${claims.length} klaim stok toko (${p.period.label}) ke Excel.`);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="klaim-stok-toko_${p.period.fromDay}_${p.period.toDay}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
