/**
 * Completes the `output: "standalone"` build.
 *
 * Next copies the traced server and its node_modules into `.next/standalone`,
 * but deliberately leaves out two directories it cannot know how you serve:
 *
 *   .next/static  → the hashed CSS and JS chunks
 *   public        → logo, icons, anything served at the site root
 *
 * Without them the server still starts and still answers 200 for every page,
 * because the HTML renders fine — only every asset it references 404s. The
 * result reaches users as an unstyled, non-interactive page while every smoke
 * check that only looks at status codes passes. That is why this runs as a
 * postbuild step rather than living in a deploy runbook: a step in a document
 * can be skipped, and its absence does not look like a failure.
 *
 * Runs on `npm run build` via the `postbuild` lifecycle. It is a no-op when
 * `.next/standalone` does not exist, so turning standalone off breaks nothing.
 */
import { cp, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(STANDALONE))) {
    console.log("postbuild: .next/standalone tidak ada — dilewati (output standalone tidak aktif).");
    return;
  }

  const jobs = [
    {
      label: ".next/static",
      from: path.join(ROOT, ".next", "static"),
      to: path.join(STANDALONE, ".next", "static"),
    },
    {
      label: "public",
      from: path.join(ROOT, "public"),
      to: path.join(STANDALONE, "public"),
    },
  ];

  for (const job of jobs) {
    if (!(await exists(job.from))) {
      console.log(`postbuild: ${job.label} tidak ada — dilewati.`);
      continue;
    }
    await cp(job.from, job.to, { recursive: true, force: true });
    console.log(`postbuild: ${job.label} disalin ke .next/standalone`);
  }

  console.log("postbuild: standalone lengkap.");
}

main().catch((err) => {
  // A failure here produces a build that looks fine and serves no assets, so it
  // must fail the build rather than warn.
  console.error("postbuild GAGAL:", err);
  process.exit(1);
});
