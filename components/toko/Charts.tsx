"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SERIES_COLORS } from "@/lib/chart-colors";

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
export { SERIES_COLORS };

const nf = new Intl.NumberFormat("id-ID");

/** How a column chart's values read. A string, not a function: the chart is a client component. */
export type ValueFormat = "count" | "rupiah";

/** Compact for the axis: "Rp 1,2 jt", "Rp 850 rb". */
function axisText(v: number, format: ValueFormat): string {
  if (format === "count") return nf.format(v);
  if (v >= 1_000_000_000) return `${nf.format(Math.round(v / 100_000_000) / 10)} M`;
  if (v >= 1_000_000) return `${nf.format(Math.round(v / 100_000) / 10)} jt`;
  if (v >= 1_000) return `${nf.format(Math.round(v / 1_000))} rb`;
  return nf.format(v);
}
/** In full for the tooltip. */
function fullText(v: number, format: ValueFormat, unit: string): string {
  return format === "rupiah" ? `Rp ${nf.format(v)}` : `${nf.format(v)} ${unit}`;
}

/** A clean upper bound and 3–5 ticks for a count axis. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  // Whole steps: a step under 1 rounded to the same tick twice (0, 1, 1, 2).
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export type StackedSeries = { key: string; label: string };
export type StackedBucket = {
  key: string;
  label: string;
  /** Shown in the tooltip instead of `label` when given ("10 Nov – 16 Nov 2026"). */
  longLabel?: string;
  values: Record<string, number>;
  total: number;
  /** A period still running is drawn lighter, so it is not read as a drop. */
  partial?: boolean;
};

export function StackedColumns({
  series,
  buckets,
  format = "count",
  unit = "tiket",
}: {
  series: StackedSeries[];
  buckets: StackedBucket[];
  format?: ValueFormat;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...buckets.map((b) => b.total));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  // Label every nth bucket so dates never run into each other.
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  const single = series.length === 1;
  // A phone has room for about five.
  const everyPhone = Math.max(every, Math.ceil(buckets.length / 5));

  return (
    <div className="flex flex-col gap-3">
      {/* One series needs no legend: the chart's title names it. */}
      <ul className={cn("flex flex-wrap gap-x-4 gap-y-1", single && "hidden")} aria-label="Keterangan">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative flex h-52 gap-2 md:h-56">
        <div className={cn("flex flex-col-reverse justify-between text-right text-[0.6875rem] text-muted-foreground tabular-nums", format === "rupiah" ? "w-12" : "w-7")}>
          {ticks.map((t) => (
            <span key={t} className="leading-none">{axisText(t, format)}</span>
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
                aria-label={`${b.longLabel ?? b.label}: ${fullText(b.total, format, unit)}${single ? "" : `. ${series.map((s) => `${s.label} ${b.values[s.key] ?? 0}`).join(", ")}`}${b.partial ? " (masih berjalan)" : ""}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 items-end justify-center outline-none focus-visible:bg-muted/60"
              >
                <div className={cn("flex w-full max-w-6 flex-col-reverse gap-0.5", b.partial && "opacity-55")} style={{ height: `${(b.total / top) * 100}%` }}>
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
                    <p className="font-semibold text-foreground">{b.longLabel ?? b.label} · {fullText(b.total, format, unit)}</p>
                    {b.partial && <p className="text-muted-foreground">Masih berjalan</p>}
                    {!single && series.map((s, si) => (
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
      <div className={cn("flex gap-0.5 text-[0.6875rem] text-muted-foreground", format === "rupiah" ? "ml-14" : "ml-9")}>
        {buckets.map((b, i) => (
          // A shown label may spill over its empty neighbours rather than be cut to "1…".
          <span key={b.key} className={cn("flex min-w-0 flex-1 justify-center whitespace-nowrap", i % everyPhone !== 0 && "max-md:invisible")}>
            {i % every === 0 ? b.label : ""}
          </span>
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

export type LineSeries = {
  key: string;
  label: string;
  /** Index into SERIES_COLORS — fixed per entity, so a colour never moves with the data. */
  color: number;
};
export type LineBucket = {
  key: string;
  label: string;
  longLabel?: string;
  values: Record<string, number>;
  /** Text after a series' value in the tooltip: "Service 8, Cleaning 3, Klaim 2". */
  details?: Record<string, string>;
  /** A last line in the tooltip: "Tumpukan bertambah 9". */
  note?: string;
  /** A period still running: its segment is dashed and its marker hollow-dashed. */
  partial?: boolean;
};

/**
 * Lines over time, one shared axis: straight segments with a marker on every
 * bucket (no smoothing — a curve invents values between two days). The last
 * segment is dashed when its period is still running, so a half day is not
 * read as a drop. Hover or focus a bucket for every series' value.
 */
export function LineChart({
  series,
  buckets,
  format = "count",
  unit = "tiket",
}: {
  series: LineSeries[];
  buckets: LineBucket[];
  format?: ValueFormat;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = buckets.length;
  const max = Math.max(0, ...buckets.flatMap((b) => series.map((s) => b.values[s.key] ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const every = Math.max(1, Math.ceil(n / 8));
  const everyPhone = Math.max(every, Math.ceil(n / 5));
  const partialLast = n >= 2 && Boolean(buckets[n - 1]?.partial);
  const solidEnd = partialLast ? n - 1 : n;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const value = (v: number) => (format === "rupiah" ? `Rp ${nf.format(v)}` : nf.format(v));
  const colorOf = (s: LineSeries) => SERIES_COLORS[s.color % SERIES_COLORS.length];
  const dense = n > 16;

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Keterangan">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: colorOf(s) }} />
              {s.label}
            </li>
          ))}
          {partialLast && (
            <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
              Masih berjalan
            </li>
          )}
        </ul>
      )}
      <div className="relative flex h-52 gap-2 md:h-56">
        <div className={cn("flex flex-col-reverse justify-between text-right text-[0.6875rem] text-muted-foreground tabular-nums", format === "rupiah" ? "w-12" : "w-7")}>
          {ticks.map((t) => (
            <span key={t} className="leading-none">{axisText(t, format)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <svg aria-hidden className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={100} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
            {series.map((s) => {
              const pt = (i: number) => `${x(i)},${y(buckets[i].values[s.key] ?? 0)}`;
              const solid = buckets.slice(0, solidEnd).map((_, i) => pt(i)).join(" ");
              return (
                <g key={s.key}>
                  <polyline points={solid} fill="none" stroke={colorOf(s)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {partialLast && (
                    <polyline points={`${pt(n - 2)} ${pt(n - 1)}`} fill="none" stroke={colorOf(s)} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            })}
          </svg>
          {/* Markers in HTML, so they stay round however the plot stretches. */}
          {series.map((s) =>
            buckets.map((b, i) => (
              <span
                key={`${s.key}-${b.key}`}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -translate-x-1/2 translate-y-1/2 rounded-full border-2 bg-card",
                  dense ? "size-2" : "size-2.5",
                  b.partial && "border-dashed",
                )}
                style={{
                  left: `${x(i)}%`,
                  bottom: `${((b.values[s.key] ?? 0) / top) * 100}%`,
                  borderColor: colorOf(s),
                  background: hover === i ? colorOf(s) : undefined,
                }}
              />
            )),
          )}
          <div className="absolute inset-0 flex">
            {buckets.map((b, i) => {
              const parts = series.map((s) => `${s.label} ${value(b.values[s.key] ?? 0)}${b.details?.[s.key] ? ` (${b.details[s.key]})` : ""}`);
              return (
                <div
                  key={b.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${b.longLabel ?? b.label}: ${parts.join(", ")}${b.note ? `. ${b.note}` : ""}${b.partial ? " (masih berjalan)" : ""}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="relative h-full flex-1 outline-none focus-visible:bg-muted/50"
                >
                  {hover === i && (
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 z-10 w-max max-w-64 rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md",
                        i < n / 2 ? "left-1/2 ml-2" : "right-1/2 mr-2",
                      )}
                    >
                      <p className="font-semibold text-foreground">{b.longLabel ?? b.label}</p>
                      {b.partial && <p className="text-muted-foreground">Masih berjalan</p>}
                      {series.map((s) => (
                        <p key={s.key} className="flex items-baseline gap-1.5 text-muted-foreground">
                          <span aria-hidden className="h-0.5 w-3 shrink-0 self-center rounded" style={{ background: colorOf(s) }} />
                          <span>
                            <span className="font-medium text-foreground tabular-nums">
                              {s.label} {value(b.values[s.key] ?? 0)}
                              {format === "count" && series.length === 1 ? ` ${unit}` : ""}
                            </span>
                            {b.details?.[s.key] ? ` · ${b.details[s.key]}` : ""}
                          </span>
                        </p>
                      ))}
                      {b.note && <p className="mt-0.5 text-muted-foreground">{b.note}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={cn("flex text-[0.6875rem] text-muted-foreground", format === "rupiah" ? "ml-14" : "ml-9")}>
        {buckets.map((b, i) => (
          <span key={b.key} className={cn("flex min-w-0 flex-1 justify-center whitespace-nowrap", i % everyPhone !== 0 && "max-md:invisible")}>
            {i % every === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
