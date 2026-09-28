import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger's Node.js Web Apps build with Next's standalone output and start
  // the bundled server themselves, so this is required rather than an
  // optimisation. It also shrinks the deploy: the server no longer needs the
  // full node_modules tree (945 MB in this project), only the traced subset.
  //
  // Two things it changes that are easy to miss: `public/` and `.next/static`
  // are NOT copied into `.next/standalone` by the build and must be placed
  // beside the generated server, and the entry point becomes `server.js`
  // rather than `next start`.
  output: "standalone",

  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      // ─── HTML pages: never cache across deployments ──────────────────────────
      // This prevents the ChunkLoadError where the browser holds old HTML
      // referencing JS chunks that no longer exist after a new deployment.
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
      // ─── Static JS/CSS chunks: long-term cache (safe — filenames are hashed) ─
      // Next.js already fingerprints these by content hash, so they can be
      // cached forever. The browser will fetch new chunks automatically because
      // the HTML (above) always returns fresh, pointing to the new chunk names.
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
