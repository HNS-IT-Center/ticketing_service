"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The dashboard's two chart forms, drawn in HTML so text stays crisp at any
 * width: stacked columns over time, and labelled horizontal bars. Each mark
 * carries its own hover/focus readout; every figure is also in the tables
 * under the slider, so nothing depends on the tooltip.
 *
 * Categorical colours are the validated default order (blue, orange, aqua,
 * yellow, magenta): adjacent pairs pass the colour-blind checks; three sit
 * under 3:1 on white, which the legend and the tables relieve.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;

const nf = new Intl.NumberFormat("id-ID");

/** A clean upper bound and 3–5 ticks for a count axis. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export type StackedSeries = { key: string; label: string };
export type StackedBucket = { key: string; label: string; values: Record<string, number>; total: number };

export function StackedColumns({ series, buckets }: { series: StackedSeries[]; buckets: StackedBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...buckets.map((b) => b.total));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  // Label every nth bucket so dates never run into each other.
  const every = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Keterangan">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative flex h-52 gap-2 md:h-56">
        <div className="flex w-7 flex-col-reverse justify-between text-right text-[0.6875rem] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="leading-none">{nf.format(t)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {buckets.map((b, i) => (
              <div
                key={b.key}
                tabIndex={0}
                role="img"
                aria-label={`${b.label}: ${b.total} tiket. ${series.map((s) => `${s.label} ${b.values[s.key] ?? 0}`).join(", ")}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 items-end justify-center outline-none focus-visible:bg-muted/60"
              >
                <div className="flex w-full max-w-6 flex-col-reverse gap-0.5" style={{ height: `${(b.total / top) * 100}%` }}>
                  {series.map((s, si) => {
                    const v = b.values[s.key] ?? 0;
                    if (!v) return null;
                    return (
                      <div
                        key={s.key}
                        className="w-full first:rounded-b-none last:rounded-t-[4px]"
                        style={{ flexGrow: v, background: SERIES_COLORS[si % SERIES_COLORS.length], minHeight: 2 }}
                      />
                    );
                  })}
                </div>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
                    <p className="font-semibold text-foreground">{b.label} · {nf.format(b.total)} tiket</p>
                    {series.map((s, si) => (
                      <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                        <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                        <span className="font-medium text-foreground tabular-nums">{b.values[s.key] ?? 0}</span> {s.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-9 flex gap-0.5 text-[0.6875rem] text-muted-foreground">
        {buckets.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">{i % every === 0 ? b.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

export type BarItem = { key: string; label: string; value: number; display: string; note?: string; muted?: boolean };

/** One series of labelled horizontal bars, value at the tip. */
export function HorizontalBars({ items, empty = "Belum ada data pada periode ini." }: { items: BarItem[]; empty?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  if (items.length === 0 || items.every((i) => i.value === 0)) {
    return <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          tabIndex={0}
          aria-label={`${item.label}: ${item.display}${item.note ? `, ${item.note}` : ""}`}
          onPointerEnter={() => setHover(item.key)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(item.key)}
          onBlur={() => setHover(null)}
          className="relative grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:grid-cols-[minmax(8rem,14rem)_1fr]"
        >
          <span className={cn("truncate text-sm", item.muted ? "pl-3 text-muted-foreground" : "font-medium text-foreground")}>{item.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="h-5 max-h-6 rounded-r-[4px]"
              style={{ width: `${Math.max(1, (item.value / max) * 80)}%`, background: item.muted ? "#86b6ef" : "#2a78d6" }}
            />
            <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{item.display}</span>
          </span>
          {hover === item.key && item.note && (
            <span className="pointer-events-none absolute top-full right-0 z-10 mt-1 w-max max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-muted-foreground shadow-md">
              {item.note}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
