/**
 * migrate-to-r2.ts
 * ---
 * Migrates all existing file attachments from Supabase Storage to Cloudflare R2.
 * Updates every file_url in the database to point to the new R2 public URL.
 *
 * Usage:
 *   DRY RUN  (preview only, no changes):
 *     $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npx ts-node --project tsconfig.json scripts/migrate-to-r2.ts
 *
 *   LIVE RUN (actually migrates + updates DB):
 *     $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npx ts-node --project tsconfig.json scripts/migrate-to-r2.ts --live
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbPoolConfig } from "../lib/mariadb";
import { PrismaClient } from "@prisma/client";

// ─── Config ────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--live");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_BUCKET = "attachments"; // old bucket name in Supabase

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL!;

// Derive old Supabase public base URL for the attachments bucket
const SUPABASE_PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}`;

// ─── Clients ───────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

const adapter = new PrismaMariaDb(mariadbPoolConfig());
const db = new PrismaClient({ adapter } as any);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a Supabase public URL to the relative object path inside the bucket.
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/attachments/userId/file.jpg"
 *   → "userId/file.jpg"
 */
function extractSupabasePath(url: string): string | null {
  if (!url.startsWith(SUPABASE_PUBLIC_BASE)) return null;
  return url.slice(SUPABASE_PUBLIC_BASE.length + 1); // +1 for the trailing slash
}

/**
 * Download a file from Supabase Storage using the service role key.
 * Returns the binary buffer + content-type header.
 */
async function downloadFromSupabase(filePath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filePath}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!res.ok) {
      console.warn(`  ⚠ Download failed (${res.status}): ${filePath}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { buffer, contentType };
  } catch (err) {
    console.warn(`  ⚠ Network error downloading: ${filePath}`, err);
    return null;
  }
}

/**
 * Upload a Buffer to Cloudflare R2 and return the new public URL.
 */
async function uploadToR2(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Migrate a single URL: download from Supabase → upload to R2 → return new URL.
 * Returns null if the URL is not a Supabase URL (already migrated or external).
 */
async function migrateUrl(oldUrl: string, label: string): Promise<string | null> {
  const path = extractSupabasePath(oldUrl);
  if (!path) {
    // URL is already an R2 URL or something else — skip
    if (oldUrl.startsWith(R2_PUBLIC_URL)) {
      console.log(`  ↷ Already on R2: ${label}`);
    } else {
      console.log(`  ? Unknown URL origin, skipping: ${label} → ${oldUrl.slice(0, 80)}`);
    }
    return null;
  }

  console.log(`  ↓ Downloading: ${path}`);
  const downloaded = await downloadFromSupabase(path);
  if (!downloaded) return null;

  // Use same relative path inside R2 bucket (prefix with tickets/ for clarity)
  const r2Key = path.startsWith("tickets/") ? path : `tickets/${path}`;

  if (DRY_RUN) {
    console.log(`  [DRY] Would upload → ${R2_PUBLIC_URL}/${r2Key}`);
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  const newUrl = await uploadToR2(downloaded.buffer, r2Key, downloaded.contentType);
  console.log(`  ✓ Uploaded → ${newUrl}`);
  return newUrl;
}

// ─── Main Migration ─────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log(`║  Supabase → Cloudflare R2 Migration              ║`);
  console.log(`║  Mode: ${DRY_RUN ? "DRY RUN (no DB changes)         " : "LIVE  (will update database)       "}║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // ── 1. TicketAttachment.file_url ──────────────────────────────────────────
  console.log("▶ Processing TicketAttachment.file_url...");
  const attachments = await db.ticketAttachment.findMany({
    select: { id: true, file_url: true },
  });

  for (const att of attachments) {
    process.stdout.write(`  [${att.id.slice(0, 8)}] `);
    const newUrl = await migrateUrl(att.file_url, `attachment:${att.id}`);
    if (newUrl && newUrl !== att.file_url) {
      if (!DRY_RUN) {
        await db.ticketAttachment.update({ where: { id: att.id }, data: { file_url: newUrl } });
      }
      totalMigrated++;
    } else if (newUrl === null) {
      totalSkipped++;
    }
  }

  // ── 2. Ticket proof URL columns ───────────────────────────────────────────
  console.log("\n▶ Processing Ticket proof URLs (payment/delivery/progress/revision)...");
  const tickets = await db.ticket.findMany({
    where: {
      OR: [
        { payment_proof_url: { not: null } },
        { delivery_proof_url: { not: null } },
        { progress_proof_url: { not: null } },
        { revision_proof_url: { not: null } },
      ],
    },
    select: {
      id: true,
      ticket_code: true,
      payment_proof_url: true,
      delivery_proof_url: true,
      progress_proof_url: true,
      revision_proof_url: true,
    },
  });

  for (const ticket of tickets) {
    console.log(`  Ticket ${ticket.ticket_code}:`);
    const updates: Record<string, string> = {};

    const urlFields: [string, string | null][] = [
      ["payment_proof_url", ticket.payment_proof_url],
      ["delivery_proof_url", ticket.delivery_proof_url],
      ["progress_proof_url", ticket.progress_proof_url],
      ["revision_proof_url", ticket.revision_proof_url],
    ];

    for (const [field, url] of urlFields) {
      if (!url) continue;
      process.stdout.write(`    [${field}] `);
      const newUrl = await migrateUrl(url, `${ticket.ticket_code}.${field}`);
      if (newUrl && newUrl !== url) {
        updates[field] = newUrl;
        totalMigrated++;
      } else if (newUrl === null) {
        totalSkipped++;
      }
    }

    if (!DRY_RUN && Object.keys(updates).length > 0) {
      await db.ticket.update({ where: { id: ticket.id }, data: updates });
    }
  }

  // ── 3. TicketPcBuildDetail.first_build_url + revision_build_url ───────────
  console.log("\n▶ Processing TicketPcBuildDetail URLs...");
  const pcBuilds = await db.ticketPcBuildDetail.findMany({
    where: {
      OR: [
        { first_build_url: { not: null } },
        { revision_build_url: { not: null } },
      ],
    },
    select: { id: true, ticket_id: true, first_build_url: true, revision_build_url: true },
  });

  for (const build of pcBuilds) {
    console.log(`  PcBuild for ticket ${build.ticket_id.slice(0, 8)}:`);
    const updates: Record<string, string> = {};

    if (build.first_build_url) {
      process.stdout.write(`    [first_build_url] `);
      const newUrl = await migrateUrl(build.first_build_url, "first_build_url");
      if (newUrl && newUrl !== build.first_build_url) {
        updates.first_build_url = newUrl;
        totalMigrated++;
      } else if (newUrl === null) totalSkipped++;
    }

    if (build.revision_build_url) {
      process.stdout.write(`    [revision_build_url] `);
      const newUrl = await migrateUrl(build.revision_build_url, "revision_build_url");
      if (newUrl && newUrl !== build.revision_build_url) {
        updates.revision_build_url = newUrl;
        totalMigrated++;
      } else if (newUrl === null) totalSkipped++;
    }

    if (!DRY_RUN && Object.keys(updates).length > 0) {
      await db.ticketPcBuildDetail.update({ where: { id: build.id }, data: updates });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log(`Migration ${DRY_RUN ? "DRY RUN" : "COMPLETE"}!`);
  console.log(`  ✓ Migrated : ${totalMigrated}`);
  console.log(`  ↷ Skipped  : ${totalSkipped}`);
  console.log(`  ✗ Failed   : ${totalFailed}`);
  if (DRY_RUN) {
    console.log("\n  Run with --live flag to apply changes:");
    console.log('  $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npx ts-node --project tsconfig.json scripts/migrate-to-r2.ts --live');
  }
  console.log("═══════════════════════════════════════════\n");

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
