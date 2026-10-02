import { describe, expect, it } from "vitest";
import {
  shouldTranscodeVideo,
  VIDEO_TRANSCODE_MIN_BYTES,
  VIDEO_TRANSCODE_TIMEOUT_MS,
} from "./compress";

const MB = 1024 * 1024;
const video = (sizeMB: number, type = "video/mp4") => ({ size: sizeMB * MB, type });

describe("shouldTranscodeVideo", () => {
  it("leaves a small clip alone — the reported 3.93 MB case", () => {
    // Transcoding costs one full playback, so a clip that already fits buys
    // nothing by paying it. This is the bug: "stuck on Compressing files".
    expect(shouldTranscodeVideo(video(3.93))).toBe(false);
  });

  it("leaves anything below the threshold alone", () => {
    for (const mb of [0.1, 1, 4, 7.9]) {
      expect(shouldTranscodeVideo(video(mb))).toBe(false);
    }
  });

  it("transcodes a clip at or above the threshold", () => {
    expect(shouldTranscodeVideo({ size: VIDEO_TRANSCODE_MIN_BYTES, type: "video/mp4" })).toBe(true);
    expect(shouldTranscodeVideo(video(25))).toBe(true);
  });

  it("never transcodes webm — it is already the target container", () => {
    expect(shouldTranscodeVideo(video(50, "video/webm"))).toBe(false);
  });

  it("transcodes the other camera containers once they are big enough", () => {
    for (const type of ["video/quicktime", "video/mp4", "video/3gpp", "video/x-matroska"]) {
      expect(shouldTranscodeVideo({ size: 20 * MB, type })).toBe(true);
    }
  });

  it("ignores anything that is not a video", () => {
    for (const type of ["image/jpeg", "image/heic", "application/pdf", "text/plain", ""]) {
      expect(shouldTranscodeVideo({ size: 50 * MB, type })).toBe(false);
    }
  });

  it("keeps the threshold under the 20 MB submission budget", () => {
    // next.config.ts sets serverActions.bodySizeLimit to 20mb for the whole
    // submission. A file left untranscoded must still have room to arrive.
    expect(VIDEO_TRANSCODE_MIN_BYTES).toBeLessThan(20 * MB);
  });

  it("keeps the abandon timeout long enough to be worth starting", () => {
    expect(VIDEO_TRANSCODE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(VIDEO_TRANSCODE_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});
