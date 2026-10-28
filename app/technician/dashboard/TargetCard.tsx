import { Target } from "lucide-react";
import { formatRupiah, formatRupiahCompact } from "@/lib/charges";
import { summarizeTargets } from "@/lib/reports/technicians";
import { loadTargetData } from "@/lib/reports/technicians-data";
import { resolveReportMonth } from "@/lib/reports/parts-data";
import { monthLabel } from "@/lib/reports/parts";
import { progress, targetFor } from "@/lib/reports/targets";
import { loadTargetRows } from "@/lib/reports/targets-data";
import ProgressBar from "@/components/targets/ProgressBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="md:[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-bold">
          <Target aria-hidden="true" className="size-[18px] text-primary" /> Target {monthLabel(month)}
        </CardTitle>
        <CardDescription className="text-xs">
          Dari tiket service yang kamu selesaikan bulan ini dan jasa yang dicatat di Rincian Biaya.
          {target.source === "none" && " Belum ada target yang diatur untuk bulan ini."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {measures.map((m) => (
            <div key={m.label} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">{m.label}</span>
              <span className="text-[1.375rem] leading-tight font-extrabold tabular-nums">{m.value}</span>
              <ProgressBar progress={m.p} format={m.format} />
            </div>
          ))}
        </div>
        {(mine?.unpriced ?? 0) > 0 && (
          <p className="text-xs text-tone-amber-fg">
            {mine!.unpriced} jasa belum ada harga jual — omzetnya belum terhitung.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
