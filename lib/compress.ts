/**
 * lib/compress.ts
 *
 * Client-side file compression utilities.
 * - Images → WebP (Canvas API, 85% quality, max 2048×2048)
 * - Videos → uploaded as recorded (see compressVideo)
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

// ── Video ───────────────────────────────────────────────────────────────────

/**
 * Videos are uploaded exactly as recorded. There is deliberately no transcode.
 *
 * Until 2026-10-14 this re-encoded clips of 8 MB and up to WebM with
 * MediaRecorder over `captureStream()`. Only Chrome supports that pair, so only
 * Chrome ran it — and on Android it killed the tab: fa4132b made it capture
 * every frame at the clip's native resolution (1080p, often 4K) and encode VP8
 * in software in real time at up to 6 Mbps. The phone ran out of memory, Chrome
 * reloaded the page, and the technician lost the whole form. Firefox and other
 * browsers never transcoded and kept working, which is how it was narrowed down.
 *
 * It was also aiming at the wrong number: it targeted 15 MB, and the real
 * upload ceiling is under 10 MB (see lib/upload-limit.ts), so a "successful"
 * transcode still could not be sent. A clip that is too big is now refused when
 * it is picked, with the size and what to do about it.
 */
export async function compressVideo(file: File): Promise<File> {
  return file;
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Compresses a file based on its type:
 * - image/* → WebP via Canvas
 * - video/* → unchanged
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
