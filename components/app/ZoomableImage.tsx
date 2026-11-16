"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { clampOffset, containedSize, zoomAt, MAX_ZOOM, MIN_ZOOM, type Size, type Zoom } from "@/lib/zoom";
import { cn } from "@/lib/utils";

const STEP = 1.5;
const DOUBLE_TAP_ZOOM = 2.5;

/**
 * A photo in the gallery that can be zoomed and moved:
 *
 *   + / − buttons, or the + − 0 keys;
 *   the mouse wheel, toward the pointer;
 *   double-click or double-tap, in and back out;
 *   two-finger pinch on a phone;
 *   dragging, once zoomed in.
 *
 * While zoomed in, its touches do not reach the gallery, so moving the photo
 * never swipes to the next one. A new photo starts at 100% (the gallery keys
 * this component by URL).
 */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom>({ scale: 1, x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  // No easing while a finger or the mouse is moving the photo.
  const [moving, setMoving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const multiTouch = useRef(false);

  /** The box, and the photo as drawn in it at 100% (offset sizes ignore the zoom transform). */
  const size = (): { frame: Size; photo: Size } => {
    const el = img.current;
    const frame = { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
    return { frame, photo: containedSize(frame, { w: el?.naturalWidth ?? 0, h: el?.naturalHeight ?? 0 }) };
  };
  /** A point on screen, measured from the middle of the photo box. */
  const fromCentre = (clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 } : { x: 0, y: 0 };
  };

  const apply = useCallback((scale: number, at = { x: 0, y: 0 }) => {
    const { frame, photo } = size();
    setZoom((z) => zoomAt(z, scale, at, frame, photo));
  }, []);

  // The wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      apply(zoomRef.current.scale * factor, fromCentre(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "+" || e.key === "=") apply(zoomRef.current.scale * STEP);
      else if (e.key === "-" || e.key === "_") apply(zoomRef.current.scale / STEP);
      else if (e.key === "0") apply(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply]);

  const toggleAt = (clientX: number, clientY: number) =>
    apply(zoomRef.current.scale > 1 ? 1 : DOUBLE_TAP_ZOOM, fromCentre(clientX, clientY));

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    setMoving(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: zoomRef.current.scale };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY };
      if (e.pointerType === "touch") {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          toggleAt(e.clientX, e.clientY);
          lastTap.current = 0;
        } else lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) {
        apply(pinch.current.scale * (dist / pinch.current.dist), fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2));
      }
    } else if (drag.current && zoomRef.current.scale > 1) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      const { frame, photo } = size();
      setZoom((z) => ({ ...z, ...clampOffset(z.scale, z.x + dx, z.y + dy, frame, photo) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setMoving(false);
    }
  };

  // Keep the gallery's swipe for an unzoomed photo and a one-finger gesture.
  const holdTouch = (e: React.TouchEvent) => {
    if (e.touches.length > 1) multiTouch.current = true;
    if (zoomRef.current.scale > 1 || multiTouch.current) e.stopPropagation();
    if (e.type === "touchend" && e.touches.length === 0) multiTouch.current = false;
  };

  const zoomed = zoom.scale > 1;
  const pct = Math.round(zoom.scale * 100);
  const control =
    "flex size-10 items-center justify-center rounded-full text-white outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60 disabled:opacity-40";

  return (
    <div
      ref={box}
      className={cn("relative flex w-full touch-none items-center justify-center overflow-hidden select-none", zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => toggleAt(e.clientX, e.clientY)}
      onTouchStart={holdTouch}
      onTouchEnd={holdTouch}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt={alt}
        draggable={false}
        className="block max-h-[70svh] w-full object-contain"
        style={{
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
          transition: moving ? "none" : "transform 120ms ease-out",
        }}
      />

      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-1 text-white">
        <button type="button" onClick={() => apply(zoom.scale / STEP)} disabled={zoom.scale <= MIN_ZOOM} aria-label="Perkecil" className={control}>
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => apply(1)}
          disabled={!zoomed}
          aria-label="Kembalikan ke ukuran awal"
          title="Kembalikan ke ukuran awal"
          className="min-w-14 rounded-full px-2 py-2 text-xs font-semibold tabular-nums outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60 disabled:hover:bg-transparent"
        >
          {pct}%
        </button>
        <button type="button" onClick={() => apply(zoom.scale * STEP)} disabled={zoom.scale >= MAX_ZOOM} aria-label="Perbesar" className={control}>
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
