/**
 * Tests for the pure half of lib/r2.ts — working out an object key from a
 * stored URL, which is what makes deletion possible.
 *
 * `uploadToR2` writes the URL as `${PUBLIC_URL}/${key}`, so deleting a file
 * means recognising that prefix again. If the deployment never set
 * NEXT_PUBLIC_R2_PUBLIC_URL, every delete silently reports orphans and reads
 * like a storage outage instead of a missing variable — which is the case
 * these tests pin down.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { storageKeyFromUrl, canResolveStorageKeys } = await import("./r2");

// The local .env.local sets this to the MinIO bucket root.
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

describe("canResolveStorageKeys", () => {
  it("is true for this environment, which has the public URL configured", () => {
    // If this ever fails locally, uploads still work but nothing can be
    // deleted — exactly the production risk the warning names.
    expect(canResolveStorageKeys()).toBe(true);
  });
});

describe("storageKeyFromUrl", () => {
  it("reads the key back out of a URL this app produced", () => {
    expect(
      storageKeyFromUrl(`${PUBLIC_URL}/tickets/abc123/rma-damage_NGH-000153_1.jpg`)
    ).toBe("tickets/abc123/rma-damage_NGH-000153_1.jpg");
  });

  it("handles the real URLs from a ticket deleted on 2026-10-05", () => {
    // Taken from the DeletedTicketLog snapshot, and verified 404 in MinIO
    // afterwards — so these are the shapes that must keep working.
    expect(storageKeyFromUrl(`${PUBLIC_URL}/temp/cmqonkdrt0000e4viz8ofdbzu/mslognpss4.jpg`)).toBe(
      "temp/cmqonkdrt0000e4viz8ofdbzu/mslognpss4.jpg"
    );
    expect(
      storageKeyFromUrl(`${PUBLIC_URL}/tickets/cmuqvhfpx00069ot9fz9h7kbi/rma-damage_NGH-000153_1.mp4`)
    ).toBe("tickets/cmuqvhfpx00069ot9fz9h7kbi/rma-damage_NGH-000153_1.mp4");
  });

  it("reads a key from the local driver's own prefix", () => {
    expect(storageKeyFromUrl("/uploads/tickets/abc/foto.webp")).toBe("tickets/abc/foto.webp");
  });

  it("refuses a URL on another host — not ours to delete", () => {
    expect(storageKeyFromUrl("https://example.com/tickets/abc/foto.jpg")).toBeNull();
    expect(storageKeyFromUrl("https://evil.test/../../etc/passwd")).toBeNull();
  });

  it("refuses the prefix with nothing after it", () => {
    expect(storageKeyFromUrl(`${PUBLIC_URL}/`)).toBeNull();
    expect(storageKeyFromUrl("/uploads/")).toBeNull();
  });

  it("refuses an empty or junk value instead of guessing", () => {
    expect(storageKeyFromUrl("")).toBeNull();
    expect(storageKeyFromUrl("tickets/abc/foto.jpg")).toBeNull();
    expect(storageKeyFromUrl("uploads/tickets/abc/foto.jpg")).toBeNull();
  });

  it("does not match a prefix that merely starts the same", () => {
    // `/uploadsX/...` is not `/uploads/...`.
    expect(storageKeyFromUrl("/uploadsX/tickets/abc/foto.jpg")).toBeNull();
  });
});
