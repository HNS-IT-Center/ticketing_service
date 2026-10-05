/**
 * lib/compress.ts
 *
 * Client-side file compression utilities.
 * - Images → WebP (Canvas API, 85% quality, max 2048×2048)
 * - Videos → WebM (MediaRecorder, fallback to original on iOS Safari)
 * - PDFs   → pass-through (no compression)
 *
 * All processing happens in the browser before the file is sent to the server.
 * No external npm packages required.
 */

// ── Constants ──────────────────────────────────────────────────────────────

const IMAGE_MAX_DIMENSION = 1024;
const IMAGE_QUALITY = 0.75;

/** Map file extensions to canonical MIME types (used when file.type is empty) */
const EXT_TO_MIME: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  mov: "video/quicktime",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  avi: "video/x-msvideo",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
  pdf: "application/pdf",
};

/** Resolve MIME type for a file — falls back to extension lookup if type is missing */
export function resolveMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/** Derive the best output extension for a given MIME type */
function mimeToOutputExt(mime: string): string {
  if (mime.startsWith("image/")) return "webp";
  if (mime.startsWith("video/")) return "webm";
  if (mime === "application/pdf") return "pdf";
  return mime.split("/")[1] ?? "bin";
}

// ── Image Compression ───────────────────────────────────────────────────────

/**
 * Compresses an image file to WebP using the Canvas API.
 * - Resizes to max IMAGE_MAX_DIMENSION on the longest side, preserving aspect ratio.
 * - Falls back to the original file if Canvas is not available or decoding fails.
 */
export async function compressImage(file: File): Promise<File> {
  const mime = resolveMimeType(file);
  if (!mime.startsWith("image/")) return file;

  let processFile = file;

  // Convert HEIC/HEIF to JPEG first before canvas processing
  if (mime === "image/heic" || mime === "image/heif") {
    try {
      // Dynamically import heic2any so it doesn't bloat the main bundle
      const heic2any = (await import("heic2any")).default;
      const convertedBlob = await heic2any({
        blob: processFile,
        toType: "image/jpeg",
        quality: 0.85 // Save memory during conversion on iOS
      });
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const baseName = processFile.name.replace(/\.[^/.]+$/, "");
      processFile = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    } catch (err) {
      console.warn("[compressImage] HEIC conversion failed:", err);
      return processFile; // Fallback to original if conversion fails
    }
  }

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(processFile);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate output dimensions
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > IMAGE_MAX_DIMENSION || h > IMAGE_MAX_DIMENSION) {
        if (w >= h) {
          h = Math.round((h / w) * IMAGE_MAX_DIMENSION);
          w = IMAGE_MAX_DIMENSION;
        } else {
          w = Math.round((w / h) * IMAGE_MAX_DIMENSION);
          h = IMAGE_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(processFile); // fallback
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(processFile); // fallback
            return;
          }
          // Derive a clean output filename
          const baseName = processFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
          const outName = `${baseName}.jpg`;
          resolve(new File([blob], outName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        IMAGE_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(processFile); // fallback — browser can't decode (e.g. HEIC on desktop)
    };

    img.src = objectUrl;
  });
}

// ── Video Compression ───────────────────────────────────────────────────────

/**
 * Below this, a video is uploaded as it is.
 *
 * Transcoding here is not a cheap pass over the bytes: MediaRecorder records
 * `captureStream()` while the clip PLAYS, so it costs one full playback —
 * a two-minute video takes two minutes, whatever its file size. That is worth
 * paying only when the file would otherwise not fit. The upload budget is
 * `serverActions.bodySizeLimit`, 20 MB for a whole submission, so anything
 * comfortably under it is left alone and uploads immediately.
 *
 * Reported as "stuck on Compressing files" for a 3.93 MB clip, which was never
 * about the 3.93 MB.
 */
export const VIDEO_TRANSCODE_MIN_BYTES = 8 * 1024 * 1024;

/**
 * A transcode is abandoned after this and the original kept.
 *
 * `onended` is the only thing that stopped the recorder. A clip that stalls
 * buffering, or a tab sent to the background — where browsers throttle media
 * and timers — never fires it, and the dialog sat on "Compressing files…" with
 * no way out. Real-time cost means this doubles as the ceiling on clip length.
 */
export const VIDEO_TRANSCODE_TIMEOUT_MS = 45_000;

/**
 * How many bytes a transcoded clip may aim for.
 *
 * `serverActions.bodySizeLimit` is 20 MB for the whole submission, and a
 * handover carries photos beside the video, so the clip targets 15 and leaves
 * the rest as headroom.
 */
export const VIDEO_TARGET_BYTES = 15 * 1024 * 1024;

/** Floor and ceiling for the computed bitrate, in bits per second. */
export const VIDEO_MIN_BITRATE = 1_200_000;
export const VIDEO_MAX_BITRATE = 6_000_000;

/** Used when the clip's duration cannot be read. */
export const VIDEO_FALLBACK_BITRATE = 2_500_000;

/**
 * The bitrate to ask MediaRecorder for, from how long the clip runs.
 *
 * MediaRecorder was constructed with **no** `videoBitsPerSecond` at all, and a
 * real handover came out at **221 kbps for 1920×1080** — somewhere between
 * fifteen and thirty times under what that resolution needs. The damage video
 * the RMA desk is supposed to judge from arrived as coloured blocks.
 *
 * Spending the whole upload budget is the right default here: the file is
 * evidence, it is uploaded once, and anything left unspent is quality thrown
 * away for nothing. The clamps keep a very short clip from asking for an
 * absurd bitrate and a very long one from going under what stays watchable.
 */
export function targetVideoBitrate(
  durationSeconds: number,
  budgetBytes: number = VIDEO_TARGET_BYTES
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return VIDEO_FALLBACK_BITRATE;
  }
  const bits = Math.floor((budgetBytes * 8) / durationSeconds);
  return Math.max(VIDEO_MIN_BITRATE, Math.min(VIDEO_MAX_BITRATE, bits));
}

/**
 * Whether transcoding this video is worth a full playback. Pure, so the rule
 * can be tested without a browser.
 */
export function shouldTranscodeVideo(file: { size: number; type: string }): boolean {
  const mime = file.type;
  if (!mime.startsWith("video/")) return false;
  // Already the target container.
  if (mime === "video/webm") return false;
  return file.size >= VIDEO_TRANSCODE_MIN_BYTES;
}

/**
 * Attempts to transcode a video to WebM using MediaRecorder + captureStream().
 * - Returns the original file if:
 *   - It is small enough already (see VIDEO_TRANSCODE_MIN_BYTES)
 *   - The browser doesn't support MediaRecorder WebM encoding (iOS Safari)
 *   - The transcode outruns VIDEO_TRANSCODE_TIMEOUT_MS
 *   - The result is not actually smaller
 *   - The transcoding fails for any reason
 *
 * NOTE: iOS Safari does not support MediaRecorder with video/webm.
 * In that case, the original file is returned unchanged (graceful fallback).
 */
export async function compressVideo(file: File): Promise<File> {
  const mime = resolveMimeType(file);
  if (!mime.startsWith("video/")) return file;

  if (!shouldTranscodeVideo({ size: file.size, type: mime })) return file;

  // Check if the browser supports WebM recording
  const webmMime = "video/webm;codecs=vp8,opus";
  const webmMimeFallback = "video/webm";
  const supportedMime = MediaRecorder.isTypeSupported(webmMime)
    ? webmMime
    : MediaRecorder.isTypeSupported(webmMimeFallback)
    ? webmMimeFallback
    : null;

  if (!supportedMime) {
    // Browser doesn't support WebM recording (e.g. iOS Safari) — return original
    return file;
  }

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    // The element has to be IN the document and painted, or captureStream()
    // starves. The same handover that came out at 221 kbps also came out at
    // **4.8 frames per second** over 31.8 seconds — 153 frames where there
    // should have been near a thousand — because a detached <video> is never
    // composited, so there are no frames to capture. `display: none` and
    // `visibility: hidden` stop painting too, which is why this is a tiny,
    // almost-transparent box rather than a hidden one. `cleanup` removes it.
    video.style.cssText =
      "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;" +
      "pointer-events:none;z-index:-1";
    document.body.appendChild(video);

    // Whichever path finishes first wins; the rest become no-ops. Without this
    // a stalled clip left the caller awaiting a promise that never settled.
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    const finish = (result: File) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    // Declared after `cleanup`, which closes over it — `cleanup` only ever runs
    // from `finish`, by which point this has been assigned.
    const timer = setTimeout(() => {
      try { video.pause(); } catch { /* noop */ }
      finish(file); // took too long — upload what the technician chose
    }, VIDEO_TRANSCODE_TIMEOUT_MS);

    video.onerror = () => {
      finish(file); // fallback
    };

    video.onloadedmetadata = () => {
      // Use captureStream to get a MediaStream from the video element
      const stream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (!stream) {
        finish(file); // captureStream not supported
        return;
      }

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: supportedMime,
          // Without these MediaRecorder picks for itself, and what it picked
          // was 221 kbps at 1080p. See targetVideoBitrate.
          videoBitsPerSecond: targetVideoBitrate(video.duration),
          audioBitsPerSecond: 64_000,
        });
      } catch {
        finish(file); // MediaRecorder constructor failed
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        // VP8 at MediaRecorder's default bitrate can come out LARGER than the
        // H.264 the phone recorded. Keep whichever is smaller.
        if (blob.size === 0 || blob.size >= file.size) {
          finish(file);
          return;
        }
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        finish(new File([blob], `${baseName}.webm`, { type: "video/webm" }));
      };

      recorder.onerror = () => {
        finish(file); // fallback on error
      };

      recorder.start();
      void video.play().catch(() => {
        // If play fails, stop recording and fall back
        try { recorder.stop(); } catch { /* noop */ }
      });

      video.onended = () => {
        try { recorder.stop(); } catch { /* noop */ }
      };
    };
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Compresses a file based on its type:
 * - image/* → WebP via Canvas
 * - video/* → WebM via MediaRecorder (fallback: original)
 * - other   → pass-through
 */
export async function compressFile(file: File): Promise<File> {
  const mime = resolveMimeType(file);

  if (mime.startsWith("image/")) {
    return compressImage(file);
  }

  if (mime.startsWith("video/")) {
    return compressVideo(file);
  }

  return file; // PDFs and other types pass through unchanged
}

/**
 * Returns a human-readable file size string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Normalizes a File object to ensure it has a valid MIME type.
 * If the file's type is missing or generic, infers it from the file extension.
 * Returns a new File with the corrected type if needed, or the original.
 */
export function normalizeFileType(file: File): File {
  const resolved = resolveMimeType(file);
  if (resolved === file.type) return file;
  // Re-wrap with the resolved MIME type
  return new File([file], file.name, { type: resolved });
}

/**
 * Derives the output file extension from a MIME type.
 * Used in server actions to determine the storage path extension.
 */
export function getExtFromMime(mimeType: string): string {
  return mimeToOutputExt(mimeType);
}
