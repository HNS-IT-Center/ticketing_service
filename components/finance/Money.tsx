import { CircleDollarSign } from "lucide-react";
import type { CostAccess } from "@/lib/catalog/hns-data";
import type { HeldMoney } from "@/lib/finance-claims";
import { formatRupiah } from "@/lib/charges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** A harga modal, or a dash saying why there is none. */
export function UnitCost({ cost, catalogItemId }: { cost: number | null; catalogItemId: number | null }) {
  if (cost !== null) return <span className="font-medium whitespace-nowrap tabular-nums">{formatRupiah(cost)}</span>;
  return (
    <span className="text-xs text-muted-foreground" title={catalogItemId === null ? "Unit diketik manual, tanpa kode Accurate" : "HPP tidak tersedia dari Accurate"}>
      {catalogItemId === null ? "tanpa kode Accurate" : "—"}
    </span>
  );
}

/** "Rp 12.400.000" with how many units it covers and how many have no price. */
export function HeldValue({ held, compact = false }: { held: HeldMoney; compact?: boolean }) {
  if (held.units === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col">
      <span className="font-semibold whitespace-nowrap tabular-nums">{held.units > held.unpriced ? formatRupiah(held.value) : "—"}</span>
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {held.units} unit{held.unpriced > 0 ? ` · ${held.unpriced} tanpa harga modal` : ""}
        </span>
      )}
      {compact && held.unpriced > 0 && <span className="text-xs text-muted-foreground">{held.unpriced} tanpa harga modal</span>}
    </span>
  );
}

/**
 * Why no harga modal is shown, when the catalogue cannot give one. `ok` and a
 * viewer without `view_cost` render nothing — the page says nothing about costs
 * to someone who may not see them.
 */
export function CostNotice({ cost }: { cost: CostAccess | "hidden" }) {
  if (cost === "ok" || cost === "hidden") return null;
  const text =
    cost === "no_scope"
      ? "Akses HPP (cost) untuk client “Ticketing HNS” belum diaktifkan di Data Accurate → Pengaturan → API & Integrasi. Setelah diaktifkan, harga modal dan uang tertahan muncul di sini dengan sendirinya."
      : cost === "off"
        ? "Katalog Accurate belum disambungkan di server ini (HNS_API_URL / HNS_API_TOKEN)."
        : "Katalog Accurate sedang tidak bisa dihubungi. Muat ulang halaman sebentar lagi.";
  return (
    <Alert variant="warning">
      <CircleDollarSign aria-hidden />
      <AlertTitle>Harga modal belum bisa dibaca</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
