"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Slide = { key: string; title: string; subtitle?: string; content: React.ReactNode };

const INTERVALS = [5, 10, 15, 30] as const;
const DEFAULT_INTERVAL = 10;
const INTERVAL_KEY = "toko_slide_interval";
const REFRESH_MS = 5 * 60_000;
const SWIPE_PX = 50;

// The chosen interval is a per-device preference (the shop's TV and the
// supervisor's phone differ), kept in localStorage and read without a
// hydration mismatch: the default on the server, the saved value after.
const intervalListeners = new Set<() => void>();
const intervalStore = {
  subscribe(fn: () => void) {
    intervalListeners.add(fn);
    return () => intervalListeners.delete(fn);
  },
  get(): number {
    try {
      const v = Number(localStorage.getItem(INTERVAL_KEY));
      return (INTERVALS as readonly number[]).includes(v) ? v : DEFAULT_INTERVAL;
    } catch {
      return DEFAULT_INTERVAL;
    }
  },
  getServer: () => DEFAULT_INTERVAL,
  set(v: number) {
    try {
      localStorage.setItem(INTERVAL_KEY, String(v));
    } catch {
      /* private window: the choice lasts this visit only */
    }
    intervalListeners.forEach((fn) => fn());
  },
};

/**
 * Charts shown one at a time, moving on by themselves with a visible
 * countdown (owner, 2026-11-09). Swiping, the arrows, the dots or ← → move by
 * hand and restart the count; it holds while a pointer is over the chart or a
 * finger is on it, and ⏸ stops it. The figures refresh every five minutes so a
 * screen left on in the shop stays current.
 */
export default function ChartSlider({
  slides,
  label = "Grafik dashboard toko",
  noun = "Grafik",
}: {
  slides: Slide[];
  label?: string;
  /** What one slide is called: "Grafik 2 dari 4", "Tim 1 dari 3". */
  noun?: string;
}) {
  const router = useRouter();
  const seconds = useSyncExternalStore(intervalStore.subscribe, intervalStore.get, intervalStore.getServer);
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [held, setHeld] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);

  const count = slides.length;
  const current = Math.min(index, count - 1);
  const running = !stopped && !held && count > 1;

  const go = useCallback(
    (to: number) => {
      setIndex(((to % count) + count) % count);
      setElapsed(0);
    },
    [count],
  );

  // One tick every 250 ms drives both the countdown and the move. The count is
  // kept in a ref so the move happens here, not inside a state updater (which
  // React may run twice).
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const next = elapsedRef.current + 250;
      if (next >= seconds * 1000) {
        elapsedRef.current = 0;
        setIndex((i) => (i + 1) % count);
        setElapsed(0);
      } else {
        elapsedRef.current = next;
        setElapsed(next);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, seconds, count]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  if (count === 0) return null;
  const slide = slides[current];
  const left = Math.max(0, Math.ceil((seconds * 1000 - elapsed) / 1000));

  return (
    <section
      ref={rootRef}
      data-slot="chart-slider"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(current + 1);
        if (e.key === "ArrowLeft") go(current - 1);
      }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
        setHeld(true);
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        setHeld(false);
        if (start === null || end === undefined) return;
        if (end - start < -SWIPE_PX) go(current + 1);
        else if (end - start > SWIPE_PX) go(current - 1);
      }}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm outline-none md:p-5",
        fullscreen && "h-full justify-center overflow-auto rounded-none border-0 p-8 md:p-10",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">
            {noun} {current + 1} dari {count}
          </p>
          <h2 className={cn("text-base font-semibold text-foreground md:text-lg", fullscreen && "text-2xl md:text-3xl")}>{slide.title}</h2>
          {slide.subtitle && <p className="text-sm text-muted-foreground">{slide.subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="icon" aria-label={`${noun} sebelumnya`} onClick={() => go(current - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label={`${noun} berikutnya`} onClick={() => go(current + 1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
            onClick={toggleFullscreen}
            className="hidden md:inline-flex"
          >
            {fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </Button>
        </div>
      </header>

      <div aria-live={running ? "off" : "polite"} className={cn("min-h-56", fullscreen && "min-h-[60vh]")}>
        {slide.content}
      </div>

      {/* The countdown as a line across the top of the controls. */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear motion-reduce:transition-none"
          style={{ width: `${running ? Math.min(100, (elapsed / (seconds * 1000)) * 100) : 0}%` }}
        />
      </div>
      <footer className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex shrink-0 flex-wrap items-center gap-1 xl:flex-nowrap" role="group" aria-label={`Pilih ${noun.toLowerCase()}`}>
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`${i + 1}. ${s.title}`}
              aria-current={i === current ? "true" : undefined}
              onClick={() => go(i)}
              className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-7"
            >
              <span className={cn("block size-2.5 rounded-full", i === current ? "bg-primary" : "bg-border")} />
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? "Lanjutkan pergantian otomatis" : "Hentikan pergantian otomatis"}
            >
              {stopped ? <Play aria-hidden /> : <Pause aria-hidden />}
              {stopped ? "Lanjut" : "Jeda"}
            </Button>
            <p className="min-w-44 text-sm text-muted-foreground tabular-nums" aria-live="off">
              {stopped ? "Pergantian dihentikan" : held ? "Ditahan selama dilihat" : `Berikutnya dalam ${left} detik`}
            </p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Ganti setiap">
            <span className="text-xs text-muted-foreground">Ganti setiap</span>
            {INTERVALS.map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={v === seconds ? "default" : "outline"}
                aria-pressed={v === seconds}
                onClick={() => {
                  intervalStore.set(v);
                  setElapsed(0);
                }}
                className="min-w-11 md:min-w-9"
              >
                {v} d
              </Button>
            ))}
          </div>
        </div>
      </footer>
    </section>
  );
}
