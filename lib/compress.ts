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

const IMAGE_MAX_DIMENSION = 2048;
const IMAGE_QUALITY = 0.85;

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

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
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
        resolve(file); // fallback
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // fallback
            return;
          }
          // Derive a clean output filename
          const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
          const outName = `${baseName}.webp`;
          resolve(new File([blob], outName, { type: "image/webp" }));
        },
        "image/webp",
        IMAGE_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback — browser can't decode (e.g. HEIC on desktop)
    };

    img.src = objectUrl;
  });
}

// ── Video Compression ───────────────────────────────────────────────────────

/**
 * Attempts to transcode a video to WebM using MediaRecorder + captureStream().
 * - Returns the original file if:
 *   - The browser doesn't support MediaRecorder WebM encoding (iOS Safari)
 *   - The transcoding fails for any reason
 *
 * NOTE: iOS Safari does not support MediaRecorder with video/webm.
 * In that case, the original file is returned unchanged (graceful fallback).
 */
export async function compressVideo(file: File): Promise<File> {
  const mime = resolveMimeType(file);
  if (!mime.startsWith("video/")) return file;

  // If the file is already WebM, no transcoding needed
  if (mime === "video/webm") return file;

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

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    video.onerror = () => {
      cleanup();
      resolve(file); // fallback
    };

    video.onloadedmetadata = () => {
      // Use captureStream to get a MediaStream from the video element
      const stream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (!stream) {
        cleanup();
        resolve(file); // captureStream not supported
        return;
      }

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(stream, { mimeType: supportedMime });
      } catch {
        cleanup();
        resolve(file); // MediaRecorder constructor failed
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: "video/webm" });
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        resolve(new File([blob], `${baseName}.webm`, { type: "video/webm" }));
      };

      recorder.onerror = () => {
        cleanup();
        resolve(file); // fallback on error
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
