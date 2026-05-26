<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# HNS IT Center — Agent Quick-Start

## ⚠️ Read CLAUDE.md FIRST
`CLAUDE.md` is the source of truth. It contains:
- Full tech stack, DB schema, dummy accounts
- Critical gotchas (Prisma 7, Tiptap SSR, Next.js 16 proxy.ts pattern)
- **Active sprint tracker** (🏗️ ACTIVE SPRINT section at the bottom) — check it before doing ANYTHING

## Project in One Line
Role-based service ticketing system. Three portals: Customer, Technician, Admin.
Stack: Next.js 16.2.4 App Router · Prisma 7 + Supabase Postgres · Custom JWT auth (jose) · Vanilla CSS + Tailwind v4

## Critical Rules (Do Not Violate)
1. **No middleware.ts** — use `proxy.ts`, export function named `proxy` (not `middleware`)
2. **Prisma 7 client** — always use `@prisma/adapter-pg` pattern in `lib/db.ts`. Never pass `datasources` to PrismaClient constructor
3. **Tiptap** — always pass `immediatelyRender: false` to `useEditor()`
4. **CSS** — `@import "tailwindcss"` is at line 1 of `globals.css`. Do NOT add Google Fonts `@import` to CSS — it's in `app/layout.tsx` as `<link>` tags
5. **Tailwind v4** — uses `@import "tailwindcss"` directive, NOT `@tailwind base/components/utilities`
6. **Styling split** — New components/pages → Tailwind classes. Existing components → leave vanilla CSS as-is (`.card`, `.btn`, `.form-input`, etc.)
7. **Server-only** — `lib/session.ts` has `import "server-only"`. Never import it from client components
8. **Workload Limits** — Technician workload limits are deprecated. Do not use point limits. Just count active tickets (status `waiting` or `on_progress`).
9. **Notifications** — Real-time features use Supabase `.channel()` WebSockets, not `setInterval` polling.

## Sprint Progress
See **`## 🏗️ ACTIVE SPRINT`** section in `CLAUDE.md` for the full task list with ✅/🔄/⬜ status.
Always update those status icons when you complete a task.
