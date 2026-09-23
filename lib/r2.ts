import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * File storage.
 *
 * Production uses Cloudflare R2 over the S3-compatible API. Local development
 * can instead write into `public/uploads/`, which Next.js serves statically —
 * set STORAGE_DRIVER=local. That exists so the upload paths (ticket
 * attachments, proof photos, the RMA purchase invoice) can be exercised end to
 * end without R2 credentials; without it, every upload fails a TLS handshake
 * against the placeholder endpoint.
 *
 * The local driver refuses to WRITE under NODE_ENV=production, so a stray env
 * var can never quietly redirect real uploads onto a server's filesystem. The
 * check sits on the write, not on import, so it does not break `next build`.
 */

const USE_LOCAL_STORAGE = process.env.STORAGE_DRIVER === "local";

// Public prefix and on-disk root for the local driver.
const LOCAL_URL_PREFIX = "/uploads";
const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads");

// Built lazily so the placeholder credentials are never touched when the local
// driver is active.
let r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID || "dummy"}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "dummy",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "dummy",
      },
    });
  }
  return r2Client;
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "dummy";
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://dummy";

/** MIME type → file extension mapping (shared across actions) */
export const MIME_TO_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

/**
 * Reject a key that would escape the uploads directory. Keys are built from
 * ticket ids and sanitised filenames today, but a traversal here would write
 * anywhere on disk, so it is checked rather than assumed.
 */
function resolveLocalPath(key: string): string {
  const target = path.resolve(LOCAL_ROOT, key);
  const root = path.resolve(LOCAL_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Refusing to write outside the uploads directory: ${key}`);
  }
  return target;
}

async function writeLocal(key: string, body: Buffer): Promise<string> {
  // Checked here rather than at import: `next build` runs with
  // NODE_ENV=production, so throwing on import would break the build for any
  // developer who has the local driver enabled. Guarding the write itself still
  // stops a production server from ever storing an upload on its filesystem.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STORAGE_DRIVER=local is a development-only setting and must not be used in production."
    );
  }

  const target = resolveLocalPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  // Always forward slashes: this becomes a URL, not a filesystem path.
  return `${LOCAL_URL_PREFIX}/${key.split(path.sep).join("/")}`;
}

/**
 * Upload a File object to storage.
 * @param file  The File to upload (from FormData)
 * @param key   The object key / path (e.g. "tickets/ticketId/filename.webp")
 * @returns     The public URL of the stored object
 */
export async function uploadToR2(file: File, key: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (USE_LOCAL_STORAGE) return writeLocal(key, buffer);

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  return `${PUBLIC_URL}/${key}`;
}

/**
 * Upload a raw Buffer to storage.
 * Useful for re-uploading existing files fetched from another storage provider.
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (USE_LOCAL_STORAGE) return writeLocal(key, buffer);

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${PUBLIC_URL}/${key}`;
}

/** Derive file type category from MIME type */
export function getFileType(mimeType: string): "image" | "video" | "pdf" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "pdf";
}

/** Derive file extension from MIME type or filename */
export function getExt(mimeType: string, filename: string): string {
  return MIME_TO_EXT[mimeType] || filename.split(".").pop()?.toLowerCase() || "bin";
}
