/**
 * Zoom arithmetic for the photo viewer (components/app/ZoomableImage), kept
 * pure so it can be tested. The photo is drawn with
 * `translate(x, y) scale(scale)` around the centre of its box; points are
 * measured from that centre.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export type Zoom = { scale: number; x: number; y: number };
export type Size = { w: number; h: number };

/**
 * The size the photo is drawn at inside its box before any zoom
 * (`object-contain`): as large as fits, keeping its shape.
 */
export function containedSize(box: Size, natural: Size): Size {
  if (natural.w <= 0 || natural.h <= 0 || box.w <= 0 || box.h <= 0) return box;
  const ratio = Math.min(box.w / natural.w, box.h / natural.h);
  return { w: natural.w * ratio, h: natural.h * ratio };
}

/**
 * How far the zoomed photo may move: until its edge reaches the box's edge,
 * no further — never so far that the empty space beside it shows. Along a
 * side where the zoomed photo is still smaller than the box, it stays in the
 * middle.
 */
export function clampOffset(scale: number, x: number, y: number, box: Size, photo: Size = box): { x: number; y: number } {
  const maxX = Math.max(0, (photo.w * scale - box.w) / 2);
  const maxY = Math.max(0, (photo.h * scale - box.h) / 2);
  const clamp = (v: number, m: number) => (m <= 0 ? 0 : Math.min(m, Math.max(-m, v)));
  return { x: clamp(x, maxX), y: clamp(y, maxY) };
}

/**
 * Zooms to `scale` (held between MIN_ZOOM and MAX_ZOOM) keeping the point
 * `at` where it is on screen — the pointer, the middle of a pinch, or the
 * centre for the + − buttons.
 */
export function zoomAt(z: Zoom, scale: number, at: { x: number; y: number }, box: Size, photo: Size = box): Zoom {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(scale) ? scale : z.scale));
  const ratio = next / z.scale;
  const x = at.x - (at.x - z.x) * ratio;
  const y = at.y - (at.y - z.y) * ratio;
  return { scale: next, ...clampOffset(next, x, y, box, photo) };
}
