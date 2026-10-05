import { describe, expect, it } from "vitest";
import {
  shouldTranscodeVideo,
  targetVideoBitrate,
  VIDEO_FALLBACK_BITRATE,
  VIDEO_MAX_BITRATE,
  VIDEO_MIN_BITRATE,
  VIDEO_TARGET_BYTES,
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

describe("targetVideoBitrate", () => {
  it("spends the upload budget over the clip's length", () => {
    // 15 MB across 30 seconds is 4 Mbps, which is inside the clamps.
    expect(targetVideoBitrate(30)).toBe(
      Math.floor((VIDEO_TARGET_BYTES * 8) / 30)
    );
  });

  it("would have fixed the clip that started this: 1080p, 31.8s, 221 kbps", () => {
    // The real handover, rma-damage_NGH-000153_1.webm. MediaRecorder was given
    // no bitrate at all and produced 221 kbps for 1920x1080.
    const chosen = targetVideoBitrate(31.77);
    expect(chosen).toBeGreaterThan(3_000_000);
    // Seventeen times what the broken file actually got.
    expect(chosen / 221_000).toBeGreaterThan(15);
  });

  it("never goes under the floor, however long the clip", () => {
    expect(targetVideoBitrate(600)).toBe(VIDEO_MIN_BITRATE);
    expect(targetVideoBitrate(10_000)).toBe(VIDEO_MIN_BITRATE);
  });

  it("never goes over the ceiling, however short the clip", () => {
    expect(targetVideoBitrate(0.5)).toBe(VIDEO_MAX_BITRATE);
    expect(targetVideoBitrate(1)).toBe(VIDEO_MAX_BITRATE);
  });

  it("falls back when the duration is unreadable, rather than asking for Infinity", () => {
    // video.duration is NaN until metadata loads, and Infinity for a stream.
    expect(targetVideoBitrate(NaN)).toBe(VIDEO_FALLBACK_BITRATE);
    expect(targetVideoBitrate(Infinity)).toBe(VIDEO_FALLBACK_BITRATE);
    expect(targetVideoBitrate(0)).toBe(VIDEO_FALLBACK_BITRATE);
    expect(targetVideoBitrate(-5)).toBe(VIDEO_FALLBACK_BITRATE);
  });

  it("keeps a mid-length clip inside the submission limit", () => {
    // The point of the budget: whatever it returns, duration x bitrate must
    // still fit under serverActions.bodySizeLimit with room for the photos.
    for (const seconds of [20, 30, 45, 60, 90]) {
      const bytes = (targetVideoBitrate(seconds) * seconds) / 8;
      expect(bytes).toBeLessThanOrEqual(VIDEO_TARGET_BYTES + 1);
    }
  });

  it("accepts a smaller budget when the caller has less room", () => {
    expect(targetVideoBitrate(30, 5 * 1024 * 1024)).toBeLessThan(
      targetVideoBitrate(30, 15 * 1024 * 1024)
    );
  });
});
