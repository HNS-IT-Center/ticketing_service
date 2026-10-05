import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink } from "fs/promises";
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
 *
 * A third option sits between the two: point R2_ENDPOINT at an S3-compatible
 * server such as MinIO. Unlike STORAGE_DRIVER=local, that runs the real S3 code
 * path -- the same SDK, keys, content types and public URLs as production -- so
 * a bug in the R2 path actually shows up in development instead of waiting for
 * deploy. See docs/minio-local-storage.md.
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
    // Unset means Cloudflare R2, exactly as before. Set, it points at any
    // S3-compatible server -- MinIO locally, for instance.
    const endpoint =
      process.env.R2_ENDPOINT ||
      `https://${process.env.R2_ACCOUNT_ID || "dummy"}.r2.cloudflarestorage.com`;

    // A plaintext endpoint in production would send the upload, and the signed
    // credentials with it, over the wire unencrypted. Refused rather than
    // trusted to be a deliberate choice. Checked here and not at import, for
    // the same reason as the local driver's guard: `next build` sets
    // NODE_ENV=production.
    if (process.env.NODE_ENV === "production" && !endpoint.startsWith("https://")) {
      throw new Error(
        `R2_ENDPOINT must use https in production (got "${endpoint}"). ` +
          "A plaintext S3 endpoint is a development-only setting."
      );
    }

    r2Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "dummy",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "dummy",
      },
      // MinIO and most self-hosted S3 servers cannot do virtual-host style,
      // because `bucket.localhost` does not resolve. Tied to R2_ENDPOINT rather
      // than left on for everyone: R2 does accept path style, but there is no
      // reason to change how production addresses its bucket.
      forcePathStyle: Boolean(process.env.R2_ENDPOINT),
    });
  }
  return r2Client;
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "dummy";
/** What PUBLIC_URL falls back to when the deployment never set one. */
const PUBLIC_URL_PLACEHOLDER = "https://dummy";
const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || PUBLIC_URL_PLACEHOLDER;

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

/**
 * The object key inside a stored URL, or null when the URL did not come from
 * this application's storage.
 *
 * Both drivers are understood: the local one serves `/uploads/<key>`, the S3
 * one returns `${PUBLIC_URL}/<key>`. Anything else — a URL typed in by hand, a
 * link to another host — returns null so the caller deletes nothing.
 */
export function storageKeyFromUrl(url: string): string | null {
  if (!url) return null;

  if (url.startsWith(`${LOCAL_URL_PREFIX}/`)) {
    return url.slice(LOCAL_URL_PREFIX.length + 1) || null;
  }

  if (PUBLIC_URL !== PUBLIC_URL_PLACEHOLDER && url.startsWith(`${PUBLIC_URL}/`)) {
    return url.slice(PUBLIC_URL.length + 1) || null;
  }

  return null;
}

/**
 * Whether this deployment can work out the object key of its own uploads.
 *
 * `uploadToR2` builds the stored URL as `${PUBLIC_URL}/${key}`, so deleting
 * one means recognising that prefix again. With NEXT_PUBLIC_R2_PUBLIC_URL
 * unset, PUBLIC_URL is the placeholder, every stored URL fails to match, and
 * every delete reports its files as orphans — which reads like a storage
 * outage rather than a missing environment variable. Named here so the log
 * says which it is.
 */
export function canResolveStorageKeys(): boolean {
  return USE_LOCAL_STORAGE || PUBLIC_URL !== PUBLIC_URL_PLACEHOLDER;
}

/**
 * Remove one stored file. Best effort by design.
 *
 * Callers use this after the database rows are already gone, so throwing would
 * leave the caller unable to do anything useful: the ticket is deleted either
 * way. It returns whether the object went, and the caller records the URLs it
 * could not remove so an orphan can be found later rather than forgotten.
 *
 * A key outside this application's storage is not an error — it is simply not
 * ours to delete.
 */
export async function deleteFromStorage(url: string): Promise<boolean> {
  const key = storageKeyFromUrl(url);
  if (!key) {
    if (!canResolveStorageKeys()) {
      console.error(
        "[storage] NEXT_PUBLIC_R2_PUBLIC_URL is not set, so no uploaded file " +
          "can be matched to its object key. Nothing will ever be deleted from " +
          "the bucket until it is configured."
      );
    }
    return false;
  }

  try {
    if (USE_LOCAL_STORAGE) {
      await unlink(path.join(LOCAL_ROOT, key));
      return true;
    }

    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    return true;
  } catch (error) {
    console.error(`[storage] could not delete ${key}:`, error);
    return false;
  }
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
