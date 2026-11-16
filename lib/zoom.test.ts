import { describe, expect, it } from "vitest";
import { clampOffset, containedSize, zoomAt, MAX_ZOOM } from "./zoom";

const box = { w: 400, h: 300 };

describe("containedSize", () => {
  it("fits the photo in the box keeping its shape", () => {
    expect(containedSize(box, { w: 1000, h: 1000 })).toEqual({ w: 300, h: 300 });
    expect(containedSize(box, { w: 1600, h: 600 })).toEqual({ w: 400, h: 150 });
    expect(containedSize(box, { w: 0, h: 0 })).toEqual(box); // not loaded yet
  });
});

describe("clampOffset", () => {
  it("centres a photo at 100% and stops a zoomed one at the box's edge", () => {
    expect(clampOffset(1, 50, -20, box)).toEqual({ x: 0, y: 0 });
    // A photo filling the box at 200% has 200 px spare each side across, 150 down.
    expect(clampOffset(2, 500, -500, box)).toEqual({ x: 200, y: -150 });
    expect(clampOffset(2, 30, 40, box)).toEqual({ x: 30, y: 40 });
  });

  it("never shows the empty space beside a photo narrower than its box", () => {
    // A square photo, 300 × 300 in a 400 × 300 box: at 120% it is 360 wide —
    // still narrower than the box, so it stays centred across.
    expect(clampOffset(1.2, 80, 80, box, { w: 300, h: 300 })).toEqual({ x: 0, y: 30 });
    // At 200% it is 600 wide: 100 px spare each side, not the box's 200.
    expect(clampOffset(2, 500, 0, box, { w: 300, h: 300 })).toEqual({ x: 100, y: 0 });
  });
});

describe("zoomAt", () => {
  const start = { scale: 1, x: 0, y: 0 };

  it("zooms around the centre for the buttons", () => {
    expect(zoomAt(start, 2, { x: 0, y: 0 }, box)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("keeps the point under the pointer where it was", () => {
    const z = zoomAt(start, 2, { x: 100, y: 50 }, box);
    expect(z).toEqual({ scale: 2, x: -100, y: -50 });
    expect((100 - z.x) / z.scale).toBe(100);
  });

  it("holds the scale between 100% and the maximum, and comes back to the middle at 100%", () => {
    expect(zoomAt(start, 0.2, { x: 0, y: 0 }, box).scale).toBe(1);
    expect(zoomAt(start, 99, { x: 0, y: 0 }, box).scale).toBe(MAX_ZOOM);
    expect(zoomAt({ scale: 3, x: 150, y: -90 }, 1, { x: 20, y: 20 }, box)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomAt(start, Number.NaN, { x: 0, y: 0 }, box)).toEqual(start);
  });
});
