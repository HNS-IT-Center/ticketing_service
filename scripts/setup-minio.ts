/**
 * Prepare a local MinIO server to stand in for Cloudflare R2.
 *
 *   npm run setup:minio
 *
 * Creates the bucket if it is missing and gives it anonymous read, which is
 * what R2's public bucket does and what the app assumes: `uploadToR2` returns
 * `${NEXT_PUBLIC_R2_PUBLIC_URL}/${key}` and the browser fetches it with no
 * credentials.
 *
 * Idempotent — safe to re-run.
 *
 * It refuses to touch anything that is not a local endpoint. The whole point is
 * to keep development off the real bucket, and a public-read policy applied to
 * the wrong one would be hard to notice and bad to leave behind.
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET_NAME;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!endpoint) {
  fail(
    "R2_ENDPOINT is not set in .env.local.\n" +
      "  This script only sets up a local S3 server. See docs/minio-local-storage.md.",
  );
}
if (!bucket) fail("R2_BUCKET_NAME is not set in .env.local.");
if (!accessKeyId || !secretAccessKey) {
  fail("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must both be set in .env.local.");
}

// Guard: local endpoints only.
let host: string;
try {
  host = new URL(endpoint).hostname;
} catch {
  fail(`R2_ENDPOINT is not a valid URL: "${endpoint}"`);
}
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal", "minio"];
if (!LOCAL_HOSTS.includes(host)) {
  fail(
    `Refusing to run against "${host}".\n` +
      "  This script grants the bucket anonymous read access, which must never be\n" +
      "  applied to a real one. It only runs against a local endpoint.",
  );
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

/** Anonymous GET on every object, matching a public R2 bucket. */
const publicReadPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    },
  ],
});

async function main() {
  console.log(`\nEndpoint : ${endpoint}`);
  console.log(`Bucket   : ${bucket}\n`);

  let existed = true;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log("• Bucket sudah ada");
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status !== 404 && status !== 403) throw err;
    existed = false;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log("• Bucket dibuat");
  }

  await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: publicReadPolicy }));
  console.log("• Policy anonymous read dipasang");

  // Read it back rather than trusting the write.
  const current = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }));
  const ok = (current.Policy ?? "").includes("s3:GetObject");
  console.log(`• Verifikasi policy   : ${ok ? "OK" : "GAGAL"}`);
  if (!ok) fail("Policy tidak terbaca kembali. Cek log container MinIO.");

  console.log(
    `\n✅ Siap${existed ? "" : " (bucket baru)"}. ` +
      `Upload akan muncul di ${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/<key>\n`,
  );
}

main().catch((err) => {
  console.error("\n✗ Gagal:", err instanceof Error ? err.message : err);
  console.error("  Container jalan? `docker start hns-minio`\n");
  process.exit(1);
});
