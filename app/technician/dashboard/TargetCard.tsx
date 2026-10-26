import { Target } from "lucide-react";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { summarizeTargets } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { resolveReportMonth } from "@/lib/reports/parts-data";
import { monthLabel } from "@/lib/reports/parts";
import { progress, targetFor } from "@/lib/reports/targets";
import { loadTargetRows } from "@/lib/reports/targets-data";
import ProgressBar from "@/components/targets/ProgressBar";

/**
 * This technician's month so far, against their target — the same figures the
 * admin's Target Teknisi report shows for them, counted the same way.
 */
export default async function TargetCard({ technicianId }: { technicianId: string }) {
  const month = resolveReportMonth(null);
  const [data, rows] = await Promise.all([loadTargetData(month, null, technicianId), loadTargetRows(month)]);
  const summary = summarizeTargets(data?.technicians ?? [], data?.doneTickets ?? [], data?.lines ?? []);
  const mine = summary.rows.find((r) => r.technician.id === technicianId);
  const jobs = mine?.jobs ?? 0;
  const revenue = mine?.revenue ?? 0;
  const points = mine?.points ?? 0;
  const target = targetFor(rows, technicianId, month);

  const measures = [
    { label: "Jasa", value: String(jobs), p: progress(jobs, target.jobs), format: undefined },
    { label: "Omzet jasa", value: formatRupiah(revenue), p: progress(revenue, target.revenue), format: formatRupiahCompact },
    { label: "Poin", value: String(points), p: progress(points, target.points), format: undefined },
  ];

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
          <Target size={18} style={{ color: "var(--primary-brand)" }} /> Target {monthLabel(month)}
        </h3>
        <p className="text-xs" style={{ color: "var(--text-muted)", margin: 0 }}>
          Dari tiket service yang kamu selesaikan bulan ini dan jasa yang dicatat di Rincian Biaya.
          {target.source === "none" && " Belum ada target yang diatur untuk bulan ini."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {measures.map((m) => (
          <div key={m.label} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              {m.label}
            </span>
            <span style={{ fontSize: "1.375rem", fontWeight: 800 }}>{m.value}</span>
            <ProgressBar progress={m.p} format={m.format} />
          </div>
        ))}
      </div>
      {(mine?.unpriced ?? 0) > 0 && (
        <p className="text-xs" style={{ color: "#92400e", margin: 0 }}>
          {mine!.unpriced} jasa belum ada harga jual — omzetnya belum terhitung.
        </p>
      )}
    </div>
  );
}
