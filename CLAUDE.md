@AGENTS.md

# TechServe — Role-Based Ticketing System: Project Handoff

## 🧭 Project Overview

A full-stack **role-based service ticketing system** for a computer repair/upgrade shop. Built with Next.js 16, Prisma 7, Supabase (Postgres + Storage), and Tiptap rich text.

**Live Dev Server:** `http://localhost:3000` (run `npm run dev`)  
**Root path:** Redirects to the correct portal based on role (see `/app/page.tsx`)

---

## 🔑 Dummy Accounts (Already Seeded)

| Role              | Email                  | Password      | Notes                          |
| ----------------- | ---------------------- | ------------- | ------------------------------ |
| **Administrator** | `admin@techserve.id`   | `admin123`    | Full system access             |
| **Technician**    | `budi@techserve.id`    | `tech123`     | Morning shift, Mon–Fri         |
| **Technician**    | `siti@techserve.id`    | `tech123`     | Noon shift, Mon/Wed/Fri/Sat    |
| **Technician**    | `agus@techserve.id`    | `tech123`     | Morning shift, Tue/Thu/Sat/Sun |
| **Sales**         | `sales@techserve.id`   | `sales123`    | Goes to Customer portal        |
| **Customer**      | `customer@example.com` | `customer123` | Name: John Doe                 |

To re-seed at any time: `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed`

---

## 🛠️ Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Framework     | Next.js 16.2.4 (App Router, Turbopack)                            |
| Language      | TypeScript                                                        |
| ORM           | Prisma 7.8.0                                                      |
| DB Adapter    | `@prisma/adapter-pg` (PrismaPg) — **required for Prisma 7**       |
| Database      | Supabase Postgres (Session Pooler, port 5432)                     |
| File Storage  | Supabase Storage (bucket: `attachments`)                          |
| Auth          | Custom JWT sessions via `jose` (cookie: `session`)                |
| Rich Text     | Tiptap v3 (`@tiptap/react`, StarterKit, Image, Link, Placeholder) |
| Styling       | Vanilla CSS (`app/globals.css`) — NO Tailwind classes used        |
| UI Components | Lucide React icons, react-hot-toast                               |
| Routing Guard | `proxy.ts` (Next.js 16 replacement for `middleware.ts`)           |

---

## ⚙️ Environment Variables (`.env.local`)

```env
# Copy this section into your own .env.local file and fill in your values

DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify"

NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

SESSION_SECRET="generate-a-random-32+-char-string-here"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> **Important:** `sslmode=no-verify` is intentional — the Supabase session pooler uses a self-signed cert chain. Using `sslmode=require` causes a TLS error.

---

## 🗄️ Database Schema Summary (`prisma/schema.prisma`)

### Key Models

| Model                    | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `User`                   | All roles: Administrator, Technician, Sales, Customer          |
| `Ticket`                 | Core ticket with FK to user, technician, sales                 |
| `TicketServiceDetail`    | Exists for `service` type tickets                              |
| `TicketWarrantyDetail`   | Has `purchase_date` for `warranty_claim` tickets               |
| `TicketCleaningDetail`   | Has `service_package` (Deep_Clean / Repaste)                   |
| `TicketUpgradeDetail`    | Join table — ticket ↔ Upgrade items                            |
| `Upgrade`                | Catalog of upgrade types with point cost (`name` is `@unique`) |
| `TicketPcBuildDetail`    | Header for `pc_build` tickets                                  |
| `TicketPcBuildComponent` | Components list for a PC build ticket                          |
| `TicketAttachment`       | File URLs from Supabase Storage                                |
| `TicketMessage`          | Chat/comment messages between users                            |
| `TicketStatusLog`        | Audit trail of all status changes                              |
| `TechnicianWorkload`     | Tracks `current_points` vs `max_points` (default 7)            |
| `TechnicianPerformance`  | Tracks tickets handled, success/fail counts, total points      |
| `Leaderboard`            | Monthly snapshot of technician rankings                        |
| `Notification`           | In-app alerts for status updates and messages                  |

### Enums

- `Role`: `Administrator | Technician | Sales | Customer`
- `Shift`: `morning | noon`
- `TicketType`: `service | warranty_claim | pc_build | cleaning | upgrade`
- `TicketStatus`: `waiting | on_progress | cancelled | rejected | done`
- `DeviceType`: `PC_Office | PC_Gaming | Laptop_Office | Laptop_Gaming`
- `CleaningPackage`: `Deep_Clean | Repaste`

### Point System

| Ticket Type | Points |
| ----------- | ------ |
| `pc_build`  | 4      |
| `service`   | 3      |
| all others  | 2      |

Max workload per technician: **7 points** (configurable per user via admin).

---

## 📁 File Structure

```
ticket-app-2/
├── app/
│   ├── actions/
│   │   ├── admin.ts          # createUser, updateUser, deleteUser, assignTicket,
│   │   │                     # updateTicketStatus, snapshotLeaderboard
│   │   ├── auth.ts           # loginAction, registerAction, logoutAction
│   │   ├── technician.ts     # takeTicketAction, updateTicketStatusAction
│   │   └── tickets.ts        # createTicketAction, sendMessageAction,
│   │                         # markMessagesReadAction, uploadAttachmentsAction
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── tickets/
│   │   │   ├── page.tsx               # All-tickets list with search/filter
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Full ticket detail
│   │   │       ├── AdminAssignPanel.tsx   # Technician/Sales assignment dropdowns
│   │   │       └── AdminStatusPanel.tsx   # Approve/Reject/Done/Cancel buttons
│   │   ├── users/
│   │   │   ├── page.tsx               # User list with role filter
│   │   │   ├── create/
│   │   │   │   ├── page.tsx
│   │   │   │   └── CreateUserForm.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── EditUserForm.tsx
│   │   └── performance/
│   │       ├── page.tsx
│   │       └── LeaderboardSnapshot.tsx
│   ├── customer/
│   │   ├── dashboard/page.tsx
│   │   └── tickets/
│   │       ├── page.tsx
│   │       ├── create/
│   │       │   ├── page.tsx
│   │       │   └── CreateTicketForm.tsx   # 4-step multi-form
│   │       └── [id]/
│   │           ├── page.tsx
│   │           └── TicketChat.tsx
│   ├── technician/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── TakeTicketButton.tsx
│   │   ├── tickets/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── StatusUpdater.tsx
│   │   └── leaderboard/page.tsx
│   ├── api/
│   │   └── notifications/route.ts
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── page.tsx              # Root redirect by role
│   ├── layout.tsx            # Root layout (Inter font, Toaster)
│   └── globals.css           # Full design system (vanilla CSS, ~800 lines)
├── components/
│   ├── layout/
│   │   ├── DashboardShell.tsx    # Sidebar + topbar for all portals
│   │   └── NotificationBell.tsx
│   └── ui/
│       ├── Badge.tsx             # Status/role badges
│       ├── FileUpload.tsx        # Drag-drop upload for Supabase Storage
│       ├── Modal.tsx
│       ├── RichTextEditor.tsx    # Tiptap editor
│       └── TagInput.tsx
├── lib/
│   ├── db.ts             # Prisma client (adapter-based, singleton)
│   ├── session.ts        # JWT helpers: encrypt, decrypt, requireRole, requireSession
│   └── supabase.ts       # Supabase client helpers (anon + service role)
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── prisma.config.ts  # Prisma 7 config file (datasource URL)
├── proxy.ts              # Next.js 16 routing guard (replaces middleware.ts)
└── package.json
```

---

## 🔧 Critical Fixes Applied (Know Before Touching These)

### 1. Prisma 7 — No More `datasources` Option

Prisma 7 removed `datasources` from the `PrismaClient` constructor. The **only** way to pass a DB URL is via `prisma.config.ts` (for CLI) and `@prisma/adapter-pg` (for runtime).

**`lib/db.ts`** — Always use this pattern:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const db = new PrismaClient({ adapter });
```

**`prisma/seed.ts`** — Same pattern, plus `import { config } from "dotenv"` + `config({ path: ".env.local" })`.

### 2. Supabase TLS / SSL

The session pooler uses a self-signed certificate. You must:

- Set `sslmode=no-verify` in the DATABASE_URL, AND
- Pass `ssl: { rejectUnauthorized: false }` in PrismaPg options
- When running seed manually: prefix with `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"`

### 3. Next.js 16 — `middleware.ts` → `proxy.ts`

Next.js 16 deprecated `middleware.ts`. The file is now `proxy.ts` and the exported function must be named `proxy` (not `middleware`). The `config.matcher` export works identically.

### 4. Tiptap SSR Hydration Error

Tiptap v3 causes a React hydration mismatch in Next.js SSR. Fix: always pass `immediatelyRender: false` to `useEditor()`.

```ts
const editor = useEditor({
  immediatelyRender: false,  // ← required
  extensions: [...],
  ...
});
```

### 5. CSS — No `@import` Inside CSS (Tailwind Removed)

The project originally had `@import "tailwindcss"` which broke the PostCSS pipeline when combined with Google Fonts `@import`. Both were removed from `globals.css`. Google Fonts is now loaded via `<link>` tags in `app/layout.tsx`.

### 6. `Upgrade.name` Must Be `@unique`

The seed uses `upsert({ where: { name } })` so the `Upgrade` model must have `name String @unique` in the schema.

---

## 🔄 Status Flow

```
waiting ──→ on_progress ──→ done
    │              └───────→ cancelled
    └──→ rejected
```

- **Customer** creates tickets (status starts at `waiting`)
- **Technician** can "Take Ticket" (moves to `on_progress`) then mark `done` or `cancelled`
- **Admin** can approve (`on_progress`), reject, mark done, or cancel at any stage
- Each transition logs to `TicketStatusLog` and creates a `Notification` for the customer

---

## 🔔 Notification System

- Stored in `Notification` table
- Polled via `GET /api/notifications` route
- `NotificationBell` component in the topbar polls and displays unread count
- Types: `message` (new chat), `status_update` (ticket status changed)
- **Not real-time** — uses polling. Supabase Realtime not yet wired.

---

## 📋 Remaining / Suggested Work

- [ ] **Admin user delete** — button exists in user list but needs confirmation modal
- [ ] **Real-time notifications** — upgrade from polling to Supabase Realtime channels
- [ ] **Ticket point totals** — `total_points` on Ticket is not auto-calculated; set on creation
- [ ] **Supabase Storage bucket** — bucket named `attachments` must be created with **public** read access
- [ ] **Production deployment** — switch to Supabase direct DB URL + proper certificates for prod

---

## 🚀 Running the Project

```bash
npm install
npx prisma db push
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed
npm run dev
# → http://localhost:3000
```

---

## 🏗️ ACTIVE SPRINT — HNS IT Center Feature Upgrade

> **Styling strategy:** Tailwind v4 (`@import "tailwindcss"` in globals.css) is now ACTIVE.
> Use Tailwind classes for ALL NEW components/pages. Existing vanilla CSS components are left as-is.
> Both systems coexist — do NOT remove existing CSS classes like `.card`, `.btn`, `.form-input` etc.

### Legend
- ✅ Done
- 🔄 In Progress  
- ⬜ Not Started

---

### SETUP
| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Install / enable Tailwind v4 | ✅ | Added `@import "tailwindcss"` to globals.css — already had `tailwindcss@^4` + `@tailwindcss/postcss` in package.json |
| S2 | Schema: add `assigned` + `completed` to `NotificationType` enum | ✅ | Done — `prisma/schema.prisma` updated, `db push` + `generate` run |

---

### SYSTEM / SECURITY
| # | Task | Status | Notes |
|---|------|--------|-------|
| SY1 | Session cookie → session-only (destroy on browser close) | ✅ | Done — `lib/session.ts` `createSession` has no `expires`, JWT still has 7d expiry as guard |
| SY2 | Move file upload to server-side API route | ✅ | Already done — `uploadAttachmentsAction` in `app/actions/tickets.ts` is a `"use server"` action using `createServerSupabaseClient()` with `SUPABASE_SERVICE_ROLE_KEY`. Key never sent to browser. |

---

### BRANDING / UI SHELL
| # | Task | Status | Notes |
|---|------|--------|-------|
| B1 | Replace app name "TechServe" → "HNS IT Center" logo | ✅ | login, register, DashboardShell all updated. Logo from `public/Logo HNS IT Center.jpg`. |
| B2 | Sidebar: collapsible icon-only mode (desktop) | ✅ | DashboardShell.tsx rewritten with `collapsed` state, `localStorage` persistence, 64px icon-only mode. |
| B3 | Sidebar: mobile 3/4 width (not full-screen) | ✅ | `globals.css` — sidebar is `75vw` max 300px on mobile so the exposed edge is tappable to close. Overlay `onClick` closes it. |
| B4 | Profile badge → dropdown with Sign Out / Profile / My Tickets | ✅ | DashboardShell.tsx — avatar pill opens popover dropdown with click-outside close. |

---

### CUSTOMER SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| C1 | Customer profile page | ✅ | Created `app/customer/profile/page.tsx` + `CustomerProfileForm.tsx` + `app/actions/customer.ts#updateProfileAction`. |
| C2 | Phone input: +62 prefix, number only, no scroll | ✅ | `CreateTicketForm.tsx` Step 1 — static +62 prefix badge, `inputMode="numeric"`, `onWheel` blur, stores as `+62XXX`. |
| C3 | Hardware Upgrade: remove points display | ✅ | `CreateTicketForm.tsx` — removed `{u.points} pts` span from upgrade checkbox labels. |
| C4 | Ticket view: mobile single-column layout | ✅ | `app/customer/tickets/[id]/page.tsx` — uses `.ticket-detail-grid` CSS class (collapses to 1-col at ≤768px). |
| C5 | Ticket view: better attachment display | ✅ | Shows filename, thumbnail for images, icons for PDF/Video/Other using Lucide icons. |

---

### TECHNICIAN SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| T1 | Confirmation dialog before Done/Cancel | ✅ | `StatusUpdater.tsx` rewritten — shows modal with action description before calling `updateTicketStatusAction`. |
| T2 | Leaderboard: game-style podium + bar chart | ✅ | `app/technician/leaderboard/page.tsx` rewritten with podium (2nd/1st/3rd), crown icons, glowing 1st place avatar, relative bars for the rest. |
| T3 | Technician notifications (assignment + completion) | ✅ | `app/actions/technician.ts` — `takeTicketAction` sends `assigned` notif; `updateTicketStatusAction` done sends `completed` notif with points. `NotificationBell` routes by role. |

---

### ADMIN SIDE
| # | Task | Status | Notes |
|---|------|--------|-------|
| A1 | Admin leaderboard page (missing) | ✅ | Created `app/admin/leaderboard/page.tsx` — same game-style podium design as technician leaderboard. |
| A2 | Admin performance: period filter | ✅ | `app/admin/performance/page.tsx` rewritten — month/year search params; period mode aggregates from `TicketStatusLog`; default shows all-time `TechnicianPerformance`. |
| A3 | Admin dashboard: vertical 1-column layout | ✅ | `app/admin/dashboard/page.tsx` — fully vertical flex layout, no side-by-side grids. Stats use `.admin-stats-grid` (auto-fill 150px, 2-col on mobile). |

---

### BUG FIXES (Session 2026-05-04)
| # | Bug | Status | Notes |
|---|-----|--------|-------|
| BF1 | TypeScript errors (phone_number, changed_at, workload include) | ✅ | Fixed: `phone` → `phone_number` in `actions/customer.ts` + `customer/profile/page.tsx`; `changed_at` → `created_at` in performance page; removed invalid Prisma `include` fields. |
| BF2 | Technician self-assign error | ✅ | `takeTicketAction` + `updateTicketStatusAction` in `actions/technician.ts` — skip customer notification when `ticket.user_id === session.userId` to prevent duplicate notifications on self-created tickets. |
| BF3 | Horizontal scroll on mobile list pages | ✅ | All list pages now toggle table (desktop) / card (mobile) using `.admin-ticket-table` / `.admin-ticket-cards` CSS classes. Affected: admin tickets, admin users, customer tickets, technician dashboard (both tables). |
| BF4 | Logo image error: `/Logo HNS IT Center.jpg` received null | ✅ | Renamed `public/Logo HNS IT Center.jpg` → `public/logo-hns.jpg`. Updated `src` in `DashboardShell.tsx`, `app/login/page.tsx`, `app/register/page.tsx`. |

---

### HOW TO RESUME IN A NEW SESSION

1. Read this file (`CLAUDE.md`) and the `implementation_plan.md` artifact for full context
2. Check the table above — find the first ⬜ item
3. Before coding, verify the relevant source file still matches what's described in the Notes column
4. Mark items 🔄 when starting, ✅ when done
5. Commit after each logical group (e.g., after all BRANDING items done)

**Key constraint reminders:**
- Next.js 16: routing guard is `proxy.ts` (not `middleware.ts`), exported function name is `proxy`
- Prisma 7: never use `datasources` option — use `@prisma/adapter-pg` pattern in `lib/db.ts`  
- Tiptap: always pass `immediatelyRender: false` to `useEditor()`
- No `@import` inside CSS rules — put `@import "tailwindcss"` at the very top of globals.css ✅ done
- Tailwind v4 uses `@import "tailwindcss"` NOT the old `@tailwind base/components/utilities` directives
