# Production image, for Dokploy (or any Docker host).
#
# hPanel's Node.js Web App does not use this file; it builds from package.json
# itself. Both paths end in the same place: `npm run build` produces
# `.next/standalone`, the postbuild step copies `.next/static` and `public/`
# beside it, and `node server.js` serves the lot.
#
# Build arguments (Dokploy: "Build-time Arguments"). NEXT_PUBLIC_* values are
# compiled into the bundle, so changing one means rebuilding, not restarting:
#   NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_R2_PUBLIC_URL, NEXT_PUBLIC_FROM_EMAIL
#
# Everything else (DATABASE_URL, SESSION_SECRET, R2_*, ...) is read at run
# time and belongs in the container's environment, never in the image.

# Next 16 needs Node >= 20.9 and Prisma 7 >= 20.19. Debian rather than Alpine:
# glibc, like the hosts this app has run on so far.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# `npm ci` runs `prisma generate` (postinstall), which reads prisma.config.ts,
# which requires DATABASE_URL to be set. Generating the client never connects,
# so a placeholder is enough; the real URL arrives at run time.
ARG DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_R2_PUBLIC_URL
ARG NEXT_PUBLIC_FROM_EMAIL
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*

# HOSTNAME: Docker sets it to the container id, and Next's standalone server
# binds to whatever HOSTNAME says; 0.0.0.0 makes it reachable by the proxy.
#
# TZ: what "now", "this month" and "today" mean wherever the code reads local
# time — the RMA code's YYMM, the leaderboard's default month, the monthly
# winner, the RMA queue's month start. The shop runs on WIB, so those should
# too. Stored timestamps are not affected: the MariaDB adapter writes and reads
# every DateTime in UTC whatever TZ says.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=Asia/Jakarta

# The standalone folder already holds the traced node_modules, .next/static
# and public/ (copied there by scripts/copy-standalone-assets.mjs).
COPY --from=build --chown=node:node /app/.next/standalone ./

USER node
EXPOSE 3000

# The slim image has neither wget nor curl; Node's own fetch does the job.
# /api/health without ?db=1 answers from the process alone — see the route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
